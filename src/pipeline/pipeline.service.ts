import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { GeminiService } from '../gemini/gemini.service';
import { SupabaseService, Article } from '../supabase/supabase.service';

export interface PipelineResult {
    article: Article;
    stages: {
        seoResearch: boolean;
        writing: boolean;
        humanizing: boolean;
        visualGeneration: boolean;
        interactive: boolean;
        finalReview: boolean;
    };
    errors: string[];
}

@Injectable()
export class PipelineService {
    private readonly logger = new Logger(PipelineService.name);

    constructor(
        private geminiService: GeminiService,
        private supabaseService: SupabaseService,
        private eventEmitter: EventEmitter2,
    ) { }

    /**
     * Execute the complete content pipeline for a given topic
     * Stages: SEO Research → Writing → Humanizing → Visual Gen → Interactive
     */
    async executePipeline(topic: string, author_id?: string): Promise<PipelineResult> {
        const result: PipelineResult = {
            article: null as unknown as Article,
            stages: {
                seoResearch: false,
                writing: false,
                humanizing: false,
                visualGeneration: false,
                interactive: false,
                finalReview: false,
            },
            errors: [],
        };

        try {
            // Create article record
            this.logger.log(`Starting pipeline for topic: "${topic}"`);
            this.eventEmitter.emit('pipeline.log', {
                topic,
                stage: 'seoResearch',
                message: `Initializing pipeline for: ${topic}`,
            });

            // Generate SEO slug first
            let aiSlug: string | undefined;
            try {
                this.eventEmitter.emit('pipeline.log', {
                    topic,
                    stage: 'seoResearch',
                    message: 'Suggesting SEO-friendly slug...',
                });
                aiSlug = await this.geminiService.suggestSlug(topic);
                this.logger.log(`AI suggested slug: ${aiSlug}`);
            } catch (slugError) {
                this.logger.warn('AI slug generation failed, falling back to default', slugError);
            }

            result.article = await this.supabaseService.createArticle(topic, author_id, aiSlug);

            // ===== STAGE 0: CATEGORY ASSIGNMENT =====
            this.logger.log('Stage 0: Category Assignment');
            try {
                // Get existing categories
                const existingCategories = await this.supabaseService.getAllCategories();
                const categoryNames = existingCategories.map(c => c.name);

                // Ask Gemini to suggest a category
                const categorySuggestion = await this.geminiService.suggestCategory(topic, categoryNames);

                // Find or create the category
                const category = await this.supabaseService.findOrCreateCategory(
                    categorySuggestion.categoryName,
                    categorySuggestion.description
                );

                // Assign category to article
                await this.supabaseService.updateArticleCategory(result.article.id, category.id);
                this.logger.log(`Assigned category: ${category.name}`);
            } catch (error) {
                this.logger.warn('Category assignment failed, continuing without category', error);
                result.errors.push(`Category assignment failed: ${error}`);
            }

            // ===== STAGE 1: SEO RESEARCH =====
            this.logger.log('Stage 1: SEO Research');
            this.eventEmitter.emit('pipeline.log', {
                topic,
                stage: 'seoResearch',
                message: 'Performing SEO research and keyword optimization...',
            });
            let seoData: { keywords: string[]; h2Structure: { h2: string; h3s: string[] }[]; metaDescription: string };

            try {
                seoData = await this.geminiService.seoResearch(topic);
                await this.supabaseService.updateArticle(result.article.id, {
                    keywords: seoData.keywords,
                    h2_structure: seoData.h2Structure,
                    meta_description: seoData.metaDescription,
                } as Partial<Article>);
                result.stages.seoResearch = true;
                this.logger.log(`SEO Research complete: ${seoData.keywords.length} keywords`);
            } catch (error) {
                result.errors.push(`SEO Research failed: ${error}`);
                this.logger.error('SEO Research failed', error);
                // Use fallback structure
                seoData = {
                    keywords: [topic],
                    h2Structure: [{ h2: 'Introduction', h3s: [] }, { h2: 'Main Content', h3s: [] }, { h2: 'Conclusion', h3s: [] }],
                    metaDescription: `Learn about ${topic}`,
                };
            }

            // ===== STAGE 2: LONG-FORM WRITING =====
            this.logger.log('Stage 2: Long-form Writing');
            this.eventEmitter.emit('pipeline.log', {
                topic,
                stage: 'writing',
                message: 'Writing comprehensive article content (1200+ words)...',
            });
            let articleContent: { title: string; content: string };

            try {
                articleContent = await this.geminiService.writeArticle(
                    topic,
                    seoData.keywords,
                    seoData.h2Structure,
                );
                await this.supabaseService.updateArticle(result.article.id, {
                    title: articleContent.title,
                    content_markdown: articleContent.content,
                } as Partial<Article>);
                result.stages.writing = true;
                this.logger.log(`Writing complete: ${articleContent.content.length} chars`);
            } catch (error) {
                result.errors.push(`Writing failed: ${error}`);
                this.logger.error('Writing failed', error);
                throw new Error('Critical: Writing stage failed');
            }

            // ===== STAGE 3: HUMANIZER =====
            this.logger.log('Stage 3: Humanizing');
            this.eventEmitter.emit('pipeline.log', {
                topic,
                stage: 'humanizing',
                message: 'Applying human-like tone and reducing AI patterns...',
            });

            try {
                const humanizedContent = await this.geminiService.humanizeContent(articleContent.content);
                await this.supabaseService.updateArticle(result.article.id, {
                    content_markdown: humanizedContent,
                } as Partial<Article>);
                articleContent.content = humanizedContent;
                result.stages.humanizing = true;
                this.logger.log('Humanizing complete');
            } catch (error) {
                result.errors.push(`Humanizing failed: ${error}`);
                this.logger.error('Humanizing failed', error);
                // Continue with original content
            }

            // ===== STAGE 4: VISUAL GENERATION =====
            this.logger.log('Stage 4: Visual Generation');

            try {
                // Generate Thumbnail First
                this.logger.log('Generating article thumbnail...');
                try {
                    const thumbnailPrompt = `Clean, modern, minimalist thumbnail illustration for a blog article about: ${topic}`;
                    const thumbBuffer = await this.geminiService.generateImage(thumbnailPrompt);

                    if (thumbBuffer) {
                        const thumbUrl = await this.supabaseService.uploadImage(
                            result.article.id,
                            thumbBuffer,
                            'thumbnail.png',
                        );

                        // Update article with thumbnail URL
                        await this.supabaseService.updateArticle(result.article.id, {
                            thumbnail_url: thumbUrl,
                        } as Partial<Article>);
                        this.logger.log('Thumbnail generated and saved');
                    }
                } catch (thumbError) {
                    this.logger.warn('Failed to generate thumbnail', thumbError);
                }

                this.eventEmitter.emit('pipeline.log', {
                    topic,
                    stage: 'visualGeneration',
                    message: 'Generating related image prompts and assets...',
                });

                const imagePrompts = this.geminiService.extractImagePrompts(articleContent.content);
                this.logger.log(`Found ${imagePrompts.length} image prompts`);

                for (let i = 0; i < Math.min(imagePrompts.length, 3); i++) {
                    const { prompt, placeholder } = imagePrompts[i];
                    this.logger.log(`Processing image ${i + 1}: "${prompt.substring(0, 50)}..."`);

                    const imageRecord = await this.supabaseService.createArticleImage(
                        result.article.id,
                        prompt,
                        i + 1,
                    );

                    try {
                        // Pass the unique section-specific prompt
                        const imageBuffer = await this.geminiService.generateImage(prompt);

                        if (imageBuffer) {
                            const imageUrl = await this.supabaseService.uploadImage(
                                result.article.id,
                                imageBuffer,
                                `image-${i + 1}.png`,
                            );
                            await this.supabaseService.updateImageUrl(imageRecord.id, imageUrl);

                            // Generate SEO Alt Tag using Gemini
                            const altTag = await this.geminiService.generateAltTags(prompt, topic);
                            this.logger.log(`Generated alt tag for image ${i + 1}: "${altTag}"`);

                            // Replace the specific placeholder and any trailing garbage (comments or colon prompts)
                            const escapedPlaceholder = placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

                            // Regex to catch:
                            // [IMAGE_PROMPT_1] <!-- comments -->
                            // [IMAGE_PROMPT_1]: Prompt text
                            // [IMAGE_PROMPT_1] Prompt text (if short enough)
                            const fullPlaceholderRegex = new RegExp(
                                escapedPlaceholder +
                                '(?:\\s*:\\s*[^\\n\\!]+|\\s*<!--[\\s\\S]*?-->|\\s*(?=[A-Z]))?',
                                'g'
                            );

                            // Use the generated alt tag in the markdown link
                            const imageMarkdown = `\n\n![${altTag}](${imageUrl})\n\n`;

                            articleContent.content = articleContent.content.replace(
                                fullPlaceholderRegex,
                                imageMarkdown
                            );

                            this.logger.log(`Replaced placeholder ${placeholder} with image`);
                        }
                    } catch (imgError) {
                        this.logger.warn(`Failed to generate image ${i + 1}`, imgError);
                    }
                }

                // Final cleanup: Remove any remaining [IMAGE_PROMPT_N] placeholders or prompt text 
                // that didn't get replaced (e.g. if we only generated 3 images but 5 were requested)
                articleContent.content = articleContent.content.replace(
                    /\[IMAGE_PROMPT_\d+\](?:\s*:\s*[^n\!]+|\s*<!--[\s\S]*?-->|\s*(?=[A-Z]))?/g,
                    ''
                ).trim();

                // Update content with image URLs
                await this.supabaseService.updateArticle(result.article.id, {
                    content_markdown: articleContent.content,
                } as Partial<Article>);

                result.stages.visualGeneration = true;
                this.logger.log('Visual generation complete');
            } catch (error) {
                result.errors.push(`Visual generation failed: ${error}`);
                this.logger.error('Visual generation failed', error);
            }

            // ===== STAGE 5: INTERACTIVE COMPONENT =====
            this.logger.log('Stage 5: Interactive Component');
            this.eventEmitter.emit('pipeline.log', {
                topic,
                stage: 'interactive',
                message: 'Analyzing content for interactive opportunities...',
            });

            try {
                const component = await this.geminiService.generateInteractiveComponent(
                    topic,
                    articleContent.content,
                );

                if (component) {
                    await this.supabaseService.createComponent(
                        result.article.id,
                        component.type,
                        component.config,
                    );
                    this.logger.log(`Created ${component.type} component`);
                } else {
                    this.logger.log('No interactive component needed');
                }
                result.stages.interactive = true;
            } catch (error) {
                result.errors.push(`Interactive component failed: ${error}`);
                this.logger.error('Interactive component failed', error);
            }

            // ===== STAGE 6: FINAL REVIEW AND RESTRUCTURE =====
            this.logger.log('Stage 6: Final Review and Restructure');
            this.eventEmitter.emit('pipeline.log', {
                topic,
                stage: 'finalReview',
                message: 'Performing final quality check and restructuring...',
            });

            try {
                const reviewedContent = await this.geminiService.finalReviewAndRestructure(
                    articleContent.content,
                    topic,
                );

                await this.supabaseService.updateArticle(result.article.id, {
                    content_markdown: reviewedContent,
                } as Partial<Article>);

                articleContent.content = reviewedContent;
                result.stages.finalReview = true;
                this.logger.log('Final review complete');
            } catch (error) {
                result.errors.push(`Final review failed: ${error}`);
                this.logger.error('Final review failed', error);
                // Continue with existing content if review fails
            }

            // Mark as ready for review
            result.article = await this.supabaseService.updateArticle(result.article.id, {
                status: 'review',
            } as Partial<Article>);

            this.logger.log(`Pipeline complete for article: ${result.article.id}`);
            this.eventEmitter.emit('pipeline.log', {
                topic,
                stage: 'finalReview',
                message: 'Pipeline completed successfully. Article is ready for preview.',
            });

        } catch (error) {
            this.logger.error('Pipeline failed', error);
            if (result.article?.id) {
                await this.supabaseService.updateArticle(result.article.id, {
                    status: 'draft',
                } as Partial<Article>);
            }
            result.errors.push(`Pipeline failed: ${error}`);
        }

        return result;
    }
}
