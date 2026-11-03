import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './utils/e2e';
import { makeProduct, resetDb } from './utils/db';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * #32: a hidden category (`isActive = false`) 404s on its own page, so it must
 * not leak through any other public response: the category sitemap, search
 * suggestions or the search category facet.
 */
describe('Hidden categories stay hidden (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    await resetDb(prisma);
    const visible = await prisma.category.create({
      data: { name: 'Blackout Blinds', slug: 'blackout-blinds' },
    });
    const hidden = await prisma.category.create({
      data: {
        name: 'Black Friday 2026',
        slug: 'black-friday-2026',
        isActive: false,
      },
    });
    const a = await makeProduct(prisma, { title: 'Blackwood Desk Lamp' });
    const b = await makeProduct(prisma, { title: 'Blackwood Floor Lamp' });
    await prisma.product.update({
      where: { id: a.product.id },
      data: { categoryId: visible.id },
    });
    await prisma.product.update({
      where: { id: b.product.id },
      data: { categoryId: hidden.id },
    });
  });
  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  it('omits hidden categories from the sitemap feed', async () => {
    const res = await http().get('/categories/sitemap').expect(200);
    const slugs = (res.body as { slug: string }[]).map((r) => r.slug);
    expect(slugs).toContain('blackout-blinds');
    expect(slugs).not.toContain('black-friday-2026');
  });

  it('omits hidden categories from search suggestions', async () => {
    const res = await http().get('/search/suggest?q=black').expect(200);
    const body = JSON.stringify(res.body);
    expect(body).toContain('blackout-blinds');
    expect(body).not.toContain('black-friday-2026');
  });

  it('omits hidden categories from the search category facet', async () => {
    const res = await http().get('/search/facets?q=blackwood').expect(200);
    const slugs = (res.body.categories as { slug: string }[]).map(
      (c) => c.slug,
    );
    expect(slugs).toContain('blackout-blinds');
    expect(slugs).not.toContain('black-friday-2026');
  });
});
