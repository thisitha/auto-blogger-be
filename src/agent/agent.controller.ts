import { Controller, Get, Post, Body, Logger, HttpException, HttpStatus, Headers, UnauthorizedException } from '@nestjs/common';
import { AgentService } from './agent.service';
import { SupabaseService } from '../supabase/supabase.service';

@Controller('agent')
export class AgentController {
    private readonly logger = new Logger(AgentController.name);

    constructor(
        private agentService: AgentService,
        private supabaseService: SupabaseService,
    ) { }

    @Get('config')
    async getConfig() {
        const { data, error } = await this.supabaseService['supabase']
            .from('agent_config')
            .select('*')
            .single();

        if (error) throw new HttpException('Fallback to error', HttpStatus.INTERNAL_SERVER_ERROR);
        return { success: true, data };
    }

    @Post('config')
    async updateConfig(@Body() updates: { interval_minutes?: number; is_active?: boolean }) {
        const { data, error } = await this.supabaseService['supabase']
            .from('agent_config')
            .update(updates)
            .eq('is_active', true) // Assuming single record for now or update all
            .select()
            .single();

        if (error) throw new HttpException('Update failed', HttpStatus.INTERNAL_SERVER_ERROR);

        // Reload scheduler if config changed
        await this.agentService.setupScheduler();

        return { success: true, data };
    }

    @Get('runs')
    async getRuns() {
        const { data, error } = await this.supabaseService['supabase']
            .from('agent_runs')
            .select('*, article:articles(title)')
            .order('created_at', { ascending: false })
            .limit(50);

        if (error) throw new HttpException('Failed to fetch runs', HttpStatus.INTERNAL_SERVER_ERROR);
        return { success: true, data };
    }

    @Post('trigger')
    async triggerAgent(@Headers('authorization') authHeader: string) {
        // Optional: Check CRON_SECRET if environment variable is set
        if (process.env.CRON_SECRET) {
            const expected = `Bearer ${process.env.CRON_SECRET}`;
            if (authHeader !== expected) {
                // If not Cron, we might want to check for Admin session here in the future.
                // For now, logging the attempt if it doesn't match cron secret
                this.logger.log('Trigger request received without matching CRON_SECRET (could be manual admin trigger)');
            }
        }

        // Manually trigger a run in the background (awaited for serverless)
        await this.agentService.executeAgentRun();
        return { success: true, message: 'Agent run triggered manually' };
    }
}
