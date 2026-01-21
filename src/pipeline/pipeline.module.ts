import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { PipelineService } from './pipeline.service';
import { PipelineController } from './pipeline.controller';
import { GeminiModule } from '../gemini/gemini.module';
import { SupabaseModule } from '../supabase/supabase.module';

@Module({
    imports: [
        EventEmitterModule,
        GeminiModule,
        SupabaseModule
    ],
    controllers: [PipelineController],
    providers: [PipelineService],
    exports: [PipelineService],
})
export class PipelineModule { }
