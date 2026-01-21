import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AgentService } from './agent.service';
import { AgentController } from './agent.controller';
import { SupabaseModule } from '../supabase/supabase.module';
import { GeminiModule } from '../gemini/gemini.module';
import { ArticlesModule } from '../articles/articles.module';

@Module({
    imports: [
        ScheduleModule.forRoot(),
        SupabaseModule,
        GeminiModule,
        ArticlesModule,
    ],
    providers: [AgentService],
    controllers: [AgentController],
    exports: [AgentService],
})
export class AgentModule { }
