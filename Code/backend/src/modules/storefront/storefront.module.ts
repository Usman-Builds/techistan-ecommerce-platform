import { Module } from '@nestjs/common';
import { HomepageService } from './homepage.service';
import { NavigationService } from './navigation.service';
import { ShowcaseService } from './showcase.service';
import { StorefrontController } from './storefront.controller';
import {
  AdminHomepageController,
  AdminNavigationController,
} from './admin-storefront.controller';

/**
 * Storefront content (script 18): the homepage layout and the header/footer
 * navigation, as editable data rather than hard-coded JSX.
 *
 * PrismaModule and AuditModule are @Global, so nothing needs importing here.
 */
@Module({
  controllers: [
    StorefrontController,
    AdminHomepageController,
    AdminNavigationController,
  ],
  providers: [HomepageService, NavigationService, ShowcaseService],
  exports: [HomepageService, NavigationService, ShowcaseService],
})
export class StorefrontModule {}
