import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { TransformInterceptor } from './common/interceptor/transform.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const APP_HOST = configService.get<string>('APP_HOST')
  const APP_PORT = configService.get<string>('APP_PORT')

  app.useGlobalInterceptors(new TransformInterceptor())

  await app.listen(APP_PORT, APP_HOST, () => console.log(`server is running: http://${APP_HOST}:${APP_PORT}  --${process.env.NODE_ENV}`));
}
bootstrap();
