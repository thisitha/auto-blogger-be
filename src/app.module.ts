import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { GeminiModule } from './gemini/gemini.module';
import { SupabaseModule } from './supabase/supabase.module';
import { PipelineModule } from './pipeline/pipeline.module';
import { ArticlesModule } from './articles/articles.module';
import { AgentModule } from './agent/agent.module';
import * as path from 'path';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: path.resolve(__dirname, '../../.env'),
    }),
    EventEmitterModule.forRoot(),
    GeminiModule,
    SupabaseModule,
    PipelineModule,
    ArticlesModule,
    AgentModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
