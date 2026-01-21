import { NestFactory } from '@nestjs/core';
import { ValidationPipe, INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';

let app: INestApplication;

export default async function handler(req: any, res: any) {
    if (!app) {
        app = await NestFactory.create(AppModule);

        // Enable CORS
        const envOrigins = (process.env.FRONTEND_URL || '').split(',').map(origin => origin.trim()).filter(Boolean);
        const allowedOrigins = [
            ...envOrigins,
            'http://localhost:3000',
            'https://blog.thisitha.me',
            'https://thisitha.me',
            'https://www.thisitha.me'
        ];

        app.enableCors({
            origin: allowedOrigins,
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