import { Module } from '@nestjs/common';
import { ArticlesController } from './articles.controller';
import { ArticlesService } from './articles.service';
import { PipelineModule } from '../pipeline/pipeline.module';
import { SupabaseModule } from '../supabase/supabase.module';

@Module({
    imports: [PipelineModule, SupabaseModule],
    controllers: [ArticlesController],
    providers: [ArticlesService],
    exports: [ArticlesService],
})
export class ArticlesModule { }
