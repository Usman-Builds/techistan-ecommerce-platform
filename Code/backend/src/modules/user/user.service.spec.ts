import { Test, TestingModule } from '@nestjs/testing';
import { UserService } from './user.service';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * UserService is a thin Prisma wrapper; we mock PrismaService so the spec stays
 * DB-free and just proves the service resolves and delegates to the client.
 */
describe('UserService', () => {
  let service: UserService;
  const prisma = {
    user: {
      create: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
  });

  afterEach(() => jest.clearAllMocks());

  it('is defined', () => {
    expect(service).toBeDefined();
  });

  it('delegates findAll to prisma.user.findMany', async () => {
    await service.findAll();
    expect(prisma.user.findMany).toHaveBeenCalled();
  });
});
