import { NestFactory } from '@nestjs/core';
import { ValidationPipe, INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';

let app: INestApplication;

export default async function handler(req: any, res: any) {
    if (!app) {
        app = await NestFactory.create(AppModule);

        // Enable CORS
        app.enableCors({
            origin: process.env.FRONTEND_URL || '*', // Allow all or specific origin
            methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
            credentials: true,
        });

        // Global validation pipe
        app.useGlobalPipes(new ValidationPipe({
            whitelist: true,
            transform: true,
        }));

        // API prefix
        // Note: Vercel rewrite typically handles the routing to this function,
        // but NestJS routing expects the prefix if controllers have it.
        app.setGlobalPrefix('api');

        await app.init();
    }

    const instance = app.getHttpAdapter().getInstance();
    return instance(req, res);
}

//