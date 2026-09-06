import {
  Controller,
  DefaultValuePipe,
  Get,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { HomepageService } from './homepage.service';
import { NavigationService } from './navigation.service';
import { ShowcaseService } from './showcase.service';

/**
 * Public storefront content — no guard.
 *
 * `homepage` and `navigation` are what turn the homepage, header and footer
 * from code into data. Both report a `configured` flag so the storefront can
 * fall back to its built-in layout for a store that has never opened the
 * builder, instead of rendering a blank page.
 *
 * `testimonials` and `brands` back the two homepage blocks whose content is
 * drawn from across the catalog rather than from the section row itself
 * (script 19). They are separate calls so the homepage only pays for them when
 * those blocks are actually enabled.
 */
@Controller('storefront')
export class StorefrontController {
  constructor(
    private readonly homepage: HomepageService,
    private readonly navigation: NavigationService,
    private readonly showcase: ShowcaseService,
  ) {}

  @Get('homepage')
  getHomepage() {
    return this.homepage.getPublicHomepage();
  }

  @Get('navigation')
  getNavigation() {
    return this.navigation.getPublicNavigation();
  }

  /** Approved 4-star-and-up reviews from across the catalog. */
  @Get('testimonials')
  getTestimonials(
    @Query('limit', new DefaultValuePipe(6), ParseIntPipe) limit: number,
  ) {
    return this.showcase.listTestimonials(limit);
  }

  /** Brands with something buyable behind them, busiest first. */
  @Get('brands')
  getBrands(
    @Query('limit', new DefaultValuePipe(12), ParseIntPipe) limit: number,
  ) {
    return this.showcase.listBrands(limit);
  }
}
