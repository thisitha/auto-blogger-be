import { Injectable } from '@nestjs/common';
import { SupabaseService, Article, ArticleImage, ArticleComponent } from '../supabase/supabase.service';
import { PipelineService, PipelineResult } from '../pipeline/pipeline.service';

@Injectable()
export class ArticlesService {
    constructor(
        private supabaseService: SupabaseService,
        private pipelineService: PipelineService,
    ) { }

    /**
     * Start the content generation pipeline for a new topic
     */
    async generateArticle(topic: string, author_id?: string): Promise<PipelineResult> {
        return this.pipelineService.executePipeline(topic, author_id);
    }

    /**
     * Get all articles with optional status filter
     */
    async getArticles(status?: Article['status']): Promise<Article[]> {
        if (status) {
            return this.supabaseService.getArticlesByStatus(status);
        }
        return this.supabaseService.getAllArticles();
    }

    /**
     * Get single article by ID with images and components
     */
    async getArticleById(id: string): Promise<{
        article: Article;
        images: ArticleImage[];
        components: ArticleComponent[];
    } | null> {
        const article = await this.supabaseService.getArticle(id);
        if (!article) return null;

        const [images, components] = await Promise.all([
            this.supabaseService.getArticleImages(id),
            this.supabaseService.getArticleComponents(id),
        ]);

        return { article, images, components };
    }

    /**
     * Get article by slug (for public frontend)
     */
    async getArticleBySlug(slug: string): Promise<{
        article: Article;
        images: ArticleImage[];
        components: ArticleComponent[];
    } | null> {
        const article = await this.supabaseService.getArticleBySlug(slug);
        if (!article) return null;

        const [images, components] = await Promise.all([
            this.supabaseService.getArticleImages(article.id),
            this.supabaseService.getArticleComponents(article.id),
        ]);

        return { article, images, components };
    }

    /**
     * Get published articles for public blog
     */
    async getPublishedArticles(): Promise<Article[]> {
        return this.supabaseService.getPublishedArticles();
    }

    /**
     * Get featured articles for homepage
     */
    async getFeaturedArticles(): Promise<Article[]> {
        return this.supabaseService.getFeaturedArticles();
    }

    /**
     * Publish an article
     */
    async publishArticle(id: string): Promise<Article> {
        return this.supabaseService.publishArticle(id);
    }

    /**
     * Update article content (for admin edits)
     */
    async updateArticle(id: string, updates: Partial<Article>): Promise<Article> {
        return this.supabaseService.updateArticle(id, updates);
    }

    /**
     * Delete an article
     */
    async deleteArticle(id: string): Promise<void> {
        return this.supabaseService.deleteArticle(id);
    }

    /**
     * Get theme settings
     */
    async getTheme() {
        return this.supabaseService.getTheme();
    }

    /**
     * Update theme settings
     */
    async updateTheme(updates: {
        primary_color?: string;
        secondary_color?: string;
        accent_color?: string;
        font_family?: string;
        heading_font?: string;
    }) {
        return this.supabaseService.updateTheme(updates);
    }

    // ============ CATEGORIES ============

    /**
     * Get all categories
     */
    async getCategories() {
        return this.supabaseService.getAllCategories();
    }

    /**
     * Get category by slug with its articles
     */
    async getCategoryWithArticles(slug: string) {
        const category = await this.supabaseService.getCategoryBySlug(slug);
        if (!category) return null;

        const articles = await this.supabaseService.getArticlesByCategory(category.id);
        return { category, articles };
    }

    // ============ NEWSLETTER ============

    /**
     * Subscribe to newsletter
     */
    async subscribeToNewsletter(email: string, source: string, ip?: string, userAgent?: string) {
        return this.supabaseService.subscribeToNewsletter(email, source, ip, userAgent);
    }

    /**
     * Get all subscribers
     */
    async getSubscribers() {
        return this.supabaseService.getAllSubscribers();
    }

    // ============ PROFILES ============

    /**
     * Get profile by ID
     */
    async getProfile(id: string) {
        return this.supabaseService.getProfile(id);
    }

    /**
     * Update profile
     */
    async updateProfile(id: string, updates: any) {
        return this.supabaseService.updateProfile(id, updates);
    }

    /**
     * List all profiles
     */
    async listProfiles() {
        return this.supabaseService.listProfiles();
    }
}
