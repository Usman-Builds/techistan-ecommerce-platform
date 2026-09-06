import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('returns the branded welcome message', () => {
      expect(appController.getHello()).toBe('Welcome to Prismora AI!');
    });
  });

  describe('health', () => {
    it('reports ok for uptime monitoring (NFR-305)', () => {
      expect(appController.health()).toEqual({ status: 'ok' });
    });
  });
});
