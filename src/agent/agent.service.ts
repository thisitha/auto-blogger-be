import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { SupabaseService } from '../supabase/supabase.service';
import { GeminiService } from '../gemini/gemini.service';
import { ArticlesService } from '../articles/articles.service';

@Injectable()
export class AgentService implements OnModuleInit {
    private readonly logger = new Logger(AgentService.name);
    private readonly JOB_NAME = 'auto_article_generation';

    constructor(
        private schedulerRegistry: SchedulerRegistry,
        private supabaseService: SupabaseService,
        private geminiService: GeminiService,
        private articlesService: ArticlesService,
    ) { }

    async onModuleInit() {
        this.logger.log('Initializing Autonomous Agent...');
        await this.setupScheduler();
    }

    /**
     * Set up or update the dynamic cron job based on config
     */
    async setupScheduler() {
        try {
            // 1. Get configuration
            const { data: config, error } = await this.supabaseService['supabase']
                .from('agent_config')
                .select('*')
                .single();

            if (error || !config) {
                this.logger.error('Failed to load agent config', error);
                return;
            }

            if (!config.is_active) {
                this.logger.log('Agent is disabled in config.');
                this.stopCron();
                return;
            }

            // 2. Create cron expression from minutes
            // Default 120 mins = every 2 hours
            const intervalMins = config.interval_minutes || 120;

            // For simplicity, we'll use a standard interval. 
            // If it's less than 60, we do every X minutes. 
            // If it's 60+, we do every X hours.
            let cronExp = '0 0 */2 * * *'; // Default: every 2 hours on the hour

            if (intervalMins < 60) {
                cronExp = `0 */${intervalMins} * * * *`;
            } else {
                const hours = Math.floor(intervalMins / 60);
                cronExp = `0 0 */${hours} * * *`;
            }

            this.logger.log(`Scheduling agent with interval: ${intervalMins} mins (Cron: ${cronExp})`);

            // 3. Register job
            this.updateCron(cronExp);

        } catch (err) {
            this.logger.error('Error during scheduler setup', err);
        }
    }

    private updateCron(cronExp: string) {
        this.stopCron();

        const job = new CronJob(cronExp, () => {
            this.executeAgentRun();
        });

        this.schedulerRegistry.addCronJob(this.JOB_NAME, job);
        job.start();
    }

    private stopCron() {
        try {
            const jobs = this.schedulerRegistry.getCronJobs();
            if (jobs.has(this.JOB_NAME)) {
                this.schedulerRegistry.deleteCronJob(this.JOB_NAME);
            }
        } catch (e) { }
    }

    /**
     * The main execution loop for the agent
     */
    async executeAgentRun() {
        this.logger.log('Starting autonomous agent run...');

        // 1. Create run record
        const { data: run, error: runError } = await this.supabaseService['supabase']
            .from('agent_runs')
            .insert({ status: 'searching', logs: 'Starting run...' })
            .select()
            .single();

        if (runError) {
            this.logger.error('Failed to create agent run record', runError);
            return;
        }

        try {
            // 2. Brainstorm topic
            await this.updateRunStatus(run.id, 'searching', 'Brainstorming unique tech topic...');
            const topicPrompt = await this.brainstormTopic();

            await this.updateRunStatus(run.id, 'generating', `Topic selected: ${topicPrompt}`, topicPrompt);

            // 3. Trigger generation
            this.logger.log(`Triggering article generation for: ${topicPrompt}`);
            const result = await this.articlesService.generateArticle(topicPrompt);

            // 4. Finalize
            if (result.article?.id) {
                await this.updateRunStatus(run.id, 'completed', 'Article generated successfully.', topicPrompt, result.article.id);

                // Update last_run_at in config
                await this.supabaseService['supabase']
                    .from('agent_config')
                    .update({ last_run_at: new Date().toISOString() })
                    .eq('is_active', true); // Assuming single record
            } else {
                throw new Error(result.errors?.join(', ') || 'Generation failed without error message');
            }

        } catch (err) {
            this.logger.error('Agent run failed', err);
            await this.updateRunStatus(run.id, 'failed', `Error: ${err.message}`);
        }
    }

    /**
     * Use Gemini to find a unique tech topic based on existing articles
     */
    async brainstormTopic(): Promise<string> {
        const existingTitles = await this.supabaseService.getAllArticleTitles();

        const systemInstruction = `You are a cutting-edge tech journalist and trend scout. Your goal is to find a fresh, highly relevant, and unique topic for a new technical article.
        
FOCUS AREAS:
- Major framework updates (React, Next.js, NestJS, Go, Rust, etc.)
- Innovative tools or libraries in the AI/Dev ecosystem
- Critical security vulnerabilities or interesting "bugs of the week"
- New innovations in web performance, edge computing, or cloud-native tech

UNIQUENESS RULE:
You MUST NOT cover topics that overlap with these existing titles:
[${existingTitles.join(', ')}]

OUTPUT:
Provide a detailed, compelling article topic/prompt that includes the specific tech, the "hook" (why it's important now), and a hint of the technical depth. 
Return ONLY the topic prompt string (max 200 chars).`;

        const response = await this.geminiService.generateText(
            "Find a unique and trending tech topic to write about today.",
            systemInstruction
        );

        return response.trim();
    }

    private async updateRunStatus(runId: string, status: string, logEntry: string, topic?: string, articleId?: string) {
        const { data: current } = await this.supabaseService['supabase']
            .from('agent_runs')
            .select('logs')
            .eq('id', runId)
            .single();

        const newLogs = (current?.logs || '') + '\n' + `[${new Date().toISOString()}] ${logEntry}`;

        const updates: any = { status, logs: newLogs };
        if (topic) updates.topic = topic;
        if (articleId) updates.article_id = articleId;
        if (status === 'completed' || status === 'failed') updates.completed_at = new Date().toISOString();

        await this.supabaseService['supabase']
            .from('agent_runs')
            .update(updates)
            .eq('id', runId);
    }
}
