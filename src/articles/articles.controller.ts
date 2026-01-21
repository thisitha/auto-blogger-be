import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
    Query,
    Ip,
    Headers,
    HttpException,
    HttpStatus,
} from '@nestjs/common';
import { ArticlesService } from './articles.service';
import { IsString, IsOptional, MinLength, IsIn } from 'class-validator';

// DTOs
class GenerateArticleDto {
    @IsString()
    @MinLength(3)
    topic: string;

    @IsOptional()
    @IsString()
    author_id?: string;
}

class UpdateProfileDto {
    @IsOptional()
    @IsString()
    full_name?: string;

    @IsOptional()
    @IsString()
    avatar_url?: string;

    @IsOptional()
    @IsString()
    bio?: string;
}

class UpdateArticleDto {
    @IsOptional()
    @IsString()
    title?: string;

    @IsOptional()
    @IsString()
    content_markdown?: string;

    @IsOptional()
    @IsString()
    meta_description?: string;
}

class UpdateThemeDto {
    @IsOptional()
    @IsString()
    primary_color?: string;

    @IsOptional()
    @IsString()
    secondary_color?: string;

    @IsOptional()
    @IsString()
    accent_color?: string;

    @IsOptional()
    @IsString()
    font_family?: string;

    @IsOptional()
    @IsString()
    heading_font?: string;
}

@Controller('articles')
export class ArticlesController {
    constructor(private readonly articlesService: ArticlesService) { }

    /**
     * POST /api/articles/generate
     * Start the AI content generation pipeline
     */
    @Post('generate')
    async generateArticle(@Body() dto: GenerateArticleDto) {
        try {
            const result = await this.articlesService.generateArticle(dto.topic, dto.author_id);
            return {
                success: true,
                data: result,
            };
        } catch (error) {
            throw new HttpException(
                `Failed to generate article: ${error}`,
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    /**
     * GET /api/articles
     * Get all articles, optionally filtered by status
     */
    @Get()
    async getArticles(
        @Query('status') status?: 'draft' | 'processing' | 'review' | 'published',
    ) {
        const articles = await this.articlesService.getArticles(status);
        return {
            success: true,
            data: articles,
        };
    }

    /**
     * GET /api/articles/published
     * Get published articles for public blog
     */
    @Get('published')
    async getPublishedArticles() {
        const articles = await this.articlesService.getPublishedArticles();
        return {
            success: true,
            data: articles,
        };
    }

    /**
     * GET /api/articles/featured
     * Get featured articles for homepage
     */
    @Get('featured')
    async getFeaturedArticles() {
        const articles = await this.articlesService.getFeaturedArticles();
        return {
            success: true,
            data: articles,
        };
    }

    // ============ CATEGORIES (must be before :id routes) ============

    /**
     * GET /api/articles/categories
     * Get all categories
     */
    @Get('categories')
    async getCategories() {
        const categories = await this.articlesService.getCategories();
        return {
            success: true,
            data: categories,
        };
    }

    /**
     * GET /api/articles/categories/:slug
     * Get category by slug with articles
     */
    @Get('categories/:slug')
    async getCategoryBySlug(@Param('slug') slug: string) {
        const result = await this.articlesService.getCategoryWithArticles(slug);
        if (!result) {
            throw new HttpException('Category not found', HttpStatus.NOT_FOUND);
        }
        return {
            success: true,
            data: result,
        };
    }

    // ============ THEME ============

    /**
     * GET /api/articles/theme/settings
     * Get theme settings
     */
    @Get('theme/settings')
    async getTheme() {
        const theme = await this.articlesService.getTheme();
        return {
            success: true,
            data: theme,
        };
    }

    /**
     * PUT /api/articles/theme/settings
     * Update theme settings
     */
    @Put('theme/settings')
    async updateTheme(@Body() dto: UpdateThemeDto) {
        try {
            const theme = await this.articlesService.updateTheme(dto);
            return {
                success: true,
                data: theme,
            };
        } catch (error) {
            throw new HttpException(
                `Failed to update theme: ${error}`,
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    /**
     * GET /api/articles/slug/*
     * Get article by slug (for public frontend)
     */
    @Get('slug/*slug')
    async getArticleBySlug(@Param() params: any) {
        let slug = params.slug;
        if (Array.isArray(slug)) {
            slug = slug.join('/');
        }
        const result = await this.articlesService.getArticleBySlug(slug);
        if (!result) {
            throw new HttpException('Article not found', HttpStatus.NOT_FOUND);
        }
        return {
            success: true,
            data: result,
        };
    }

    // ============ NEWSLETTER ============

    /**
     * POST /api/articles/subscribe
     * Subscribe to newsletter
     */
    @Post('subscribe')
    async subscribeToNewsletter(
        @Body() body: { email: string; source?: string },
        @Ip() ip: string,
        @Headers('user-agent') userAgent: string
    ) {
        try {
            const result = await this.articlesService.subscribeToNewsletter(
                body.email,
                body.source || 'website',
                ip,
                userAgent
            );
            return {
                success: result.success,
                message: result.message,
            };
        } catch (error) {
            throw new HttpException(
                error.message || 'Failed to subscribe. Please try again.',
                HttpStatus.BAD_REQUEST,
            );
        }
    }

    /**
     * GET /api/articles/admin/subscribers
     * Get all newsletter subscribers (Admin only)
     */
    @Get('admin/subscribers')
    async getSubscribers() {
        const subscribers = await this.articlesService.getSubscribers();
        return {
            success: true,
            data: subscribers,
        };
    }

    /**
     * GET /api/articles/admin/profiles
     * List all user profiles
     */
    @Get('admin/profiles')
    async listProfiles() {
        const profiles = await this.articlesService.listProfiles();
        return {
            success: true,
            data: profiles,
        };
    }

    /**
     * GET /api/articles/admin/profiles/:id
     * Get profile by ID
     */
    @Get('admin/profiles/:id')
    async getProfile(@Param('id') id: string) {
        const profile = await this.articlesService.getProfile(id);
        if (!profile) {
            throw new HttpException('Profile not found', HttpStatus.NOT_FOUND);
        }
        return {
            success: true,
            data: profile,
        };
    }

    /**
     * PUT /api/articles/admin/profiles/:id
     * Update profile
     */
    @Put('admin/profiles/:id')
    async updateProfile(
        @Param('id') id: string,
        @Body() dto: UpdateProfileDto,
    ) {
        try {
            const profile = await this.articlesService.updateProfile(id, dto);
            return {
                success: true,
                data: profile,
                message: 'Profile updated successfully',
            };
        } catch (error) {
            throw new HttpException(
                `Failed to update profile: ${error.message}`,
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    // ============ PARAMETERIZED ROUTES (must be last) ============

    /**
     * GET /api/articles/:id
     * Get single article with images and components
     */
    @Get(':id')
    async getArticle(@Param('id') id: string) {
        const result = await this.articlesService.getArticleById(id);
        if (!result) {
            throw new HttpException('Article not found', HttpStatus.NOT_FOUND);
        }
        return {
            success: true,
            data: result,
        };
    }

    /**
     * POST /api/articles/:id/publish
     * Publish an article
     */
    @Post(':id/publish')
    async publishArticle(@Param('id') id: string) {
        try {
            const article = await this.articlesService.publishArticle(id);
            return {
                success: true,
                data: article,
                message: 'Article published successfully',
            };
        } catch (error) {
            throw new HttpException(
                `Failed to publish: ${error}`,
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    /**
     * PUT /api/articles/:id
     * Update article content
     */
    @Put(':id')
    async updateArticle(
        @Param('id') id: string,
        @Body() dto: UpdateArticleDto,
    ) {
        try {
            const article = await this.articlesService.updateArticle(id, dto);
            return {
                success: true,
                data: article,
            };
        } catch (error) {
            throw new HttpException(
                `Failed to update: ${error}`,
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    /**
     * DELETE /api/articles/:id
     * Delete an article
     */
    @Delete(':id')
    async deleteArticle(@Param('id') id: string) {
        try {
            await this.articlesService.deleteArticle(id);
            return {
                success: true,
                message: 'Article deleted successfully',
            };
        } catch (error) {
            throw new HttpException(
                `Failed to delete: ${error}`,
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }
}
