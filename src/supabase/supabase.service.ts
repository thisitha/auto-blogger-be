import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface Article {
    id: string;
    title: string;
    slug: string;
    content_markdown: string | null;
    meta_description: string | null;
    keywords: string[];
    h2_structure: { h2: string; h3s: string[] }[];
    status: 'draft' | 'processing' | 'review' | 'published';
    thumbnail_url: string | null;
    featured: boolean;
    category_id: string | null;
    author_id: string | null;
    topic: string | null;
    created_at: string;
    updated_at: string;
    published_at: string | null;
    author?: Profile | null;
}

export interface Profile {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
    bio: string | null;
    updated_at: string;
    created_at: string;
}

export interface ArticleImage {
    id: string;
    article_id: string;
    prompt: string;
    storage_url: string | null;
    position: number;
    created_at: string;
}

export interface ArticleComponent {
    id: string;
    article_id: string;
    component_type: string;
    config: Record<string, unknown>;
    created_at: string;
}

export interface ThemeSettings {
    id: string;
    primary_color: string;
    secondary_color: string;
    accent_color: string;
    font_family: string;
    heading_font: string;
    updated_at: string;
}

export interface Category {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    color: string;
    icon: string;
    created_at: string;
}

@Injectable()
export class SupabaseService {
    private readonly logger = new Logger(SupabaseService.name);
    private readonly supabase: SupabaseClient;

    constructor(private configService: ConfigService) {
        const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
        const supabaseKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

        if (!supabaseUrl || !supabaseKey) {
            throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured');
        }

        this.supabase = createClient(supabaseUrl, supabaseKey);
    }

    // ============ ARTICLES ============

    async createArticle(topic: string, author_id?: string, customSlug?: string): Promise<Article> {
        const slug = customSlug
            ? this.formatCustomSlug(customSlug)
            : this.generateSlug(topic);

        const { data, error } = await this.supabase
            .from('articles')
            .insert({
                topic,
                slug,
                author_id,
                title: topic.substring(0, 500), // Truncate to match DB limit
                status: 'processing',
            })
            .select()
            .single();

        if (error) {
            this.logger.error('Failed to create article', error);
            throw error;
        }

        return data;
    }

    async updateArticle(id: string, updates: Partial<Article>): Promise<Article> {
        const { data, error } = await this.supabase
            .from('articles')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            this.logger.error('Failed to update article', error);
            throw error;
        }

        return data;
    }

    async getArticle(id: string): Promise<Article | null> {
        const { data, error } = await this.supabase
            .from('articles')
            .select('*, author:profiles(*)')
            .eq('id', id)
            .single();

        if (error) {
            if (error.code === 'PGRST116') return null;
            throw error;
        }

        return data;
    }

    async getArticleBySlug(slug: string): Promise<Article | null> {
        const { data, error } = await this.supabase
            .from('articles')
            .select('*, author:profiles(*)')
            .eq('slug', slug)
            .single();

        if (error) {
            if (error.code === 'PGRST116') return null;
            throw error;
        }

        return data;
    }

    async getArticlesByStatus(status: Article['status']): Promise<Article[]> {
        const { data, error } = await this.supabase
            .from('articles')
            .select('*')
            .eq('status', status)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data || [];
    }

    async getAllArticles(): Promise<Article[]> {
        const { data, error } = await this.supabase
            .from('articles')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data || [];
    }

    async getPublishedArticles(): Promise<Article[]> {
        const { data, error } = await this.supabase
            .from('articles')
            .select('*')
            .eq('status', 'published')
        if (error) throw error;
        return data || [];
    }

    async getFeaturedArticles(): Promise<Article[]> {
        const { data, error } = await this.supabase
            .from('articles')
            .select('*')
            .eq('status', 'published')
            .eq('featured', true)
            .order('published_at', { ascending: false });

        if (error) throw error;
        return data || [];
    }

    async publishArticle(id: string): Promise<Article> {
        return this.updateArticle(id, {
            status: 'published',
            published_at: new Date().toISOString(),
        } as Partial<Article>);
    }

    async deleteArticle(id: string): Promise<void> {
        const { error } = await this.supabase
            .from('articles')
            .delete()
            .eq('id', id);

        if (error) throw error;
    }

    async getAllArticleTitles(): Promise<string[]> {
        const { data, error } = await this.supabase
            .from('articles')
            .select('title');

        if (error) throw error;
        return (data || []).map(a => a.title);
    }

    // ============ IMAGES ============

    async createArticleImage(
        articleId: string,
        prompt: string,
        position: number
    ): Promise<ArticleImage> {
        const { data, error } = await this.supabase
            .from('article_images')
            .insert({
                article_id: articleId,
                prompt,
                position,
            })
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    async updateImageUrl(imageId: string, storageUrl: string): Promise<void> {
        const { error } = await this.supabase
            .from('article_images')
            .update({ storage_url: storageUrl })
            .eq('id', imageId);

        if (error) throw error;
    }

    async getArticleImages(articleId: string): Promise<ArticleImage[]> {
        const { data, error } = await this.supabase
            .from('article_images')
            .select('*')
            .eq('article_id', articleId)
            .order('position');

        if (error) throw error;
        return data || [];
    }

    async uploadImage(
        articleId: string,
        imageBuffer: Buffer,
        filename: string
    ): Promise<string> {
        const path = `articles/${articleId}/${filename}`;

        const { error } = await this.supabase.storage
            .from('blog-images')
            .upload(path, imageBuffer, {
                contentType: 'image/png',
                upsert: true,
            });

        if (error) {
            this.logger.error('Failed to upload image', error);
            throw error;
        }

        const { data } = this.supabase.storage
            .from('blog-images')
            .getPublicUrl(path);

        return data.publicUrl;
    }

    // ============ COMPONENTS ============

    async createComponent(
        articleId: string,
        componentType: string,
        config: Record<string, unknown>
    ): Promise<ArticleComponent> {
        const { data, error } = await this.supabase
            .from('article_components')
            .insert({
                article_id: articleId,
                component_type: componentType,
                config,
            })
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    async getArticleComponents(articleId: string): Promise<ArticleComponent[]> {
        const { data, error } = await this.supabase
            .from('article_components')
            .select('*')
            .eq('article_id', articleId);

        if (error) throw error;
        return data || [];
    }

    // ============ THEME ============

    async getTheme(): Promise<ThemeSettings | null> {
        const { data, error } = await this.supabase
            .from('theme_settings')
            .select('*')
            .limit(1)
            .single();

        if (error) {
            if (error.code === 'PGRST116') return null;
            throw error;
        }

        return data;
    }

    async updateTheme(updates: Partial<ThemeSettings>): Promise<ThemeSettings> {
        // Get existing theme ID
        const existing = await this.getTheme();
        if (!existing) {
            throw new Error('No theme settings found');
        }

        const { data, error } = await this.supabase
            .from('theme_settings')
            .update(updates)
            .eq('id', existing.id)
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    // ============ HELPERS ============

    private formatCustomSlug(slug: string): string {
        const cleanSlug = slug
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .substring(0, 100);

        const finalSlug = cleanSlug + '-' + Math.random().toString(36).substring(2, 7);
        return finalSlug;
    }

    private generateSlug(text: string): string {
        const cleanSlug = text
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .substring(0, 100);

        const finalSlug = cleanSlug + '-' + Date.now().toString(36);
        return finalSlug;
    }

    private generateCategorySlug(text: string): string {
        return text
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .substring(0, 100);
    }

    // ============ CATEGORIES ============

    async getAllCategories(): Promise<Category[]> {
        const { data, error } = await this.supabase
            .from('categories')
            .select('*')
            .order('name', { ascending: true });

        if (error) throw error;
        return data || [];
    }

    async getCategoryBySlug(slug: string): Promise<Category | null> {
        const { data, error } = await this.supabase
            .from('categories')
            .select('*')
            .eq('slug', slug)
            .single();

        if (error) {
            if (error.code === 'PGRST116') return null;
            throw error;
        }

        return data;
    }

    async getCategoryById(id: string): Promise<Category | null> {
        const { data, error } = await this.supabase
            .from('categories')
            .select('*')
            .eq('id', id)
            .single();

        if (error) {
            if (error.code === 'PGRST116') return null;
            throw error;
        }

        return data;
    }

    async createCategory(name: string, description?: string, color?: string, icon?: string): Promise<Category> {
        const slug = this.generateCategorySlug(name);

        const { data, error } = await this.supabase
            .from('categories')
            .insert({
                name,
                slug,
                description: description || null,
                color: color || '#E8D5E0',
                icon: icon || '📁',
            })
            .select()
            .single();

        if (error) {
            this.logger.error('Failed to create category', error);
            throw error;
        }

        return data;
    }

    async getCategoryByName(name: string): Promise<Category | null> {
        const { data, error } = await this.supabase
            .from('categories')
            .select('*')
            .ilike('name', name)
            .limit(1)
            .single();

        if (error) {
            if (error.code === 'PGRST116') return null;
            throw error;
        }

        return data;
    }

    async findOrCreateCategory(name: string, description?: string): Promise<Category> {
        // Try to find existing category
        let category = await this.getCategoryByName(name);

        if (!category) {
            // Create new category with a default color and icon
            const colors = ['#6366F1', '#EC4899', '#10B981', '#F59E0B', '#8B5CF6', '#06B6D4', '#3B82F6', '#EF4444'];
            const icons = ['📁', '💡', '🔧', '📚', '🌟', '🎯', '💼', '🔬'];
            const randomColor = colors[Math.floor(Math.random() * colors.length)];
            const randomIcon = icons[Math.floor(Math.random() * icons.length)];

            category = await this.createCategory(name, description, randomColor, randomIcon);
            this.logger.log(`Created new category: ${name}`);
        }

        return category;
    }

    async getArticlesByCategory(categoryId: string): Promise<Article[]> {
        const { data, error } = await this.supabase
            .from('articles')
            .select('*')
            .eq('category_id', categoryId)
            .eq('status', 'published')
            .order('published_at', { ascending: false });

        if (error) throw error;
        return data || [];
    }

    async updateArticleCategory(articleId: string, categoryId: string): Promise<Article> {
        return this.updateArticle(articleId, { category_id: categoryId } as Partial<Article>);
    }

    // ============ NEWSLETTER SUBSCRIBERS ============

    async subscribeToNewsletter(
        email: string,
        source: string = 'website',
        ip_address?: string,
        user_agent?: string
    ): Promise<{ success: boolean; message: string }> {
        const cleanEmail = email.toLowerCase().trim();

        // Basic spam check: Check if this IP has subscribed too many times recently
        if (ip_address) {
            const { data: recentSubs, error: countError } = await this.supabase
                .from('newsletter_subscribers')
                .select('subscribed_at')
                .eq('ip_address', ip_address)
                .gt('subscribed_at', new Date(Date.now() - 60 * 60 * 1000).toISOString()); // Last 1 hour

            if (!countError && recentSubs && recentSubs.length >= 5) {
                throw new Error('Too many subscription attempts from this connection. Please try again later.');
            }
        }

        const { error } = await this.supabase
            .from('newsletter_subscribers')
            .insert({
                email: cleanEmail,
                source,
                ip_address,
                user_agent,
            });

        if (error) {
            if (error.code === '23505') { // Unique violation
                return { success: true, message: 'You are already subscribed!' };
            }
            this.logger.error('Failed to subscribe', error);
            throw error;
        }

        this.logger.log(`New subscriber: ${cleanEmail}`);
        return { success: true, message: 'Successfully subscribed!' };
    }

    async getAllSubscribers(): Promise<any[]> {
        const { data, error } = await this.supabase
            .from('newsletter_subscribers')
            .select('*')
            .order('subscribed_at', { ascending: false });

        if (error) throw error;
        return data || [];
    }

    // ============ PROFILES ============

    async getProfile(id: string): Promise<Profile | null> {
        const { data, error } = await this.supabase
            .from('profiles')
            .select('*')
            .eq('id', id)
            .single();

        if (error) {
            if (error.code === 'PGRST116') return null;
            this.logger.error(`Failed to get profile for ${id}`, error);
            throw error;
        }

        return data;
    }

    async updateProfile(id: string, updates: Partial<Profile>): Promise<Profile> {
        const { data, error } = await this.supabase
            .from('profiles')
            .update({
                ...updates,
                updated_at: new Date().toISOString(),
            })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            this.logger.error(`Failed to update profile for ${id}`, error);
            throw error;
        }

        return data;
    }

    async listProfiles(): Promise<Profile[]> {
        const { data, error } = await this.supabase
            .from('profiles')
            .select('*')
            .order('full_name', { ascending: true });

        if (error) {
            this.logger.error('Failed to list profiles', error);
            throw error;
        }

        return data || [];
    }

    async isEmailSubscribed(email: string): Promise<boolean> {
        const { data, error } = await this.supabase
            .from('newsletter_subscribers')
            .select('id')
            .eq('email', email.toLowerCase().trim())
            .eq('is_active', true)
            .limit(1)
            .single();

        if (error) {
            if (error.code === 'PGRST116') return false;
            throw error;
        }

        return !!data;
    }
}
