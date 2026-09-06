import { Test, TestingModule } from '@nestjs/testing';
import { UserController } from './user.controller';
import { UserService } from './user.service';

/**
 * Controller-level unit test — the service is mocked, so this proves wiring and
 * delegation without touching Prisma. RBAC on the routes is exercised in the
 * integration suite (test/rbac.e2e-spec.ts), which is where guard behavior
 * actually matters (NFR-208).
 */
describe('UserController', () => {
  let controller: UserController;
  const userService = {
    create: jest.fn(),
    findAll: jest.fn().mockResolvedValue([]),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserController],
      providers: [{ provide: UserService, useValue: userService }],
    }).compile();

    controller = module.get<UserController>(UserController);
  });

  afterEach(() => jest.clearAllMocks());

  it('is defined', () => {
    expect(controller).toBeDefined();
  });

  it('delegates listing to the service', async () => {
    await controller.findAll();
    expect(userService.findAll).toHaveBeenCalled();
  });
});
