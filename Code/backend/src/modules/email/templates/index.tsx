// ─────────────────────────────────────────────────────────────────────────────
// Transactional email templates (script 16, FR-901/903).
//
// Every template composes <BaseLayout> so it matches the storefront visually and
// pulls all colors/fonts/logo from the shared brand tokens (see ./theme). Props
// are typed — no ad-hoc HTML is assembled by callers. Money is always formatted
// from integer cents via ./money.
// ─────────────────────────────────────────────────────────────────────────────
import * as React from 'react';
import {
  Body,
  Container,
  Column,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Row,
  Section,
  Text,
} from '@react-email/components';
import { emailTheme as t } from './theme';
import { formatMoney } from './money';

// Store-specific chrome resolved at send time from StoreSetting + config.
export interface EmailBranding {
  storeName: string;
  logoUrl: string | null;
  contactEmail: string | null;
  /** Physical mailing address for CAN-SPAM compliance (footer). */
  address: string;
  /** Where "manage preferences / unsubscribe" points (storefront account page). */
  manageUrl: string;
}

// ─────────────────────────────── Base layout ────────────────────────────────

export function BaseLayout({
  branding,
  preview,
  children,
}: {
  branding: EmailBranding;
  preview: string;
  children: React.ReactNode;
}) {
  return (
    <Html lang="en">
      <Head>
        <meta name="color-scheme" content="light dark" />
        <meta name="supported-color-schemes" content="light dark" />
      </Head>
      <Preview>{preview}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Section style={styles.header}>
            {branding.logoUrl ? (
              <Img
                src={branding.logoUrl}
                alt={branding.storeName}
                height={36}
                style={{ margin: '0 auto', display: 'block' }}
              />
            ) : (
              <Heading style={styles.wordmark}>{branding.storeName}</Heading>
            )}
          </Section>

          <Section style={styles.card}>{children}</Section>

          <Section style={styles.footer}>
            <Text style={styles.footerText}>
              {branding.storeName}
              {branding.contactEmail ? (
                <>
                  {' · '}
                  <Link href={`mailto:${branding.contactEmail}`} style={styles.footerLink}>
                    {branding.contactEmail}
                  </Link>
                </>
              ) : null}
            </Text>
            <Text style={styles.footerMuted}>{branding.address}</Text>
            <Text style={styles.footerMuted}>
              <Link href={branding.manageUrl} style={styles.footerLink}>
                Manage email preferences
              </Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

// Shared CTA — rendered as a bulletproof table-ish anchor for Outlook safety.
function Cta({ href, label }: { href: string; label: string }) {
  return (
    <Section style={{ textAlign: 'center', margin: '28px 0 8px' }}>
      <Link href={href} style={styles.button}>
        {label}
      </Link>
    </Section>
  );
}

function Lead({ children }: { children: React.ReactNode }) {
  return <Text style={styles.lead}>{children}</Text>;
}

// ─────────────────────────────── Auth family ────────────────────────────────

export interface VerifyEmailProps {
  branding: EmailBranding;
  verifyUrl: string;
}
export function VerifyEmail({ branding, verifyUrl }: VerifyEmailProps) {
  return (
    <BaseLayout branding={branding} preview={`Confirm your ${branding.storeName} email`}>
      <Heading style={styles.h1}>Confirm your email</Heading>
      <Lead>
        Welcome to {branding.storeName}! Please confirm your email address to activate
        your account and start shopping.
      </Lead>
      <Cta href={verifyUrl} label="Verify email" />
      <Text style={styles.small}>
        This link expires in 24 hours. If you didn’t create an account you can safely
        ignore this message.
      </Text>
    </BaseLayout>
  );
}

export interface PasswordResetProps {
  branding: EmailBranding;
  resetUrl: string;
}
export function PasswordReset({ branding, resetUrl }: PasswordResetProps) {
  return (
    <BaseLayout branding={branding} preview="Reset your password">
      <Heading style={styles.h1}>Reset your password</Heading>
      <Lead>
        We received a request to reset your {branding.storeName} password. Click below
        to choose a new one.
      </Lead>
      <Cta href={resetUrl} label="Reset password" />
      <Text style={styles.small}>
        This link expires in 1 hour. If you didn’t request a reset, no action is needed —
        your password will stay the same.
      </Text>
    </BaseLayout>
  );
}

export interface WelcomeProps {
  branding: EmailBranding;
  firstName: string | null;
  shopUrl: string;
}
export function Welcome({ branding, firstName, shopUrl }: WelcomeProps) {
  return (
    <BaseLayout branding={branding} preview={`Welcome to ${branding.storeName}`}>
      <Heading style={styles.h1}>
        Welcome{firstName ? `, ${firstName}` : ''} 👋
      </Heading>
      <Lead>
        Your email is verified and your {branding.storeName} account is ready. Explore
        the latest arrivals and enjoy a faster checkout with your saved details.
      </Lead>
      <Cta href={shopUrl} label="Start shopping" />
    </BaseLayout>
  );
}

// ────────────────────────────── Order family ────────────────────────────────

export interface OrderLine {
  title: string;
  variant?: string | null;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
}
export interface OrderConfirmationProps {
  branding: EmailBranding;
  firstName: string | null;
  orderNumber: string;
  currency: string;
  items: OrderLine[];
  subtotalCents: number;
  shippingCents: number;
  taxCents: number;
  discountCents: number;
  totalCents: number;
  orderUrl: string;
}
export function OrderConfirmation(props: OrderConfirmationProps) {
  const { branding, orderNumber, currency, items, orderUrl } = props;
  const m = (c: number) => formatMoney(c, currency);
  return (
    <BaseLayout branding={branding} preview={`Order ${orderNumber} confirmed`}>
      <Heading style={styles.h1}>Thanks for your order!</Heading>
      <Lead>
        We’ve received order <strong>{orderNumber}</strong> and are getting it ready.
        Here’s your receipt.
      </Lead>

      <Section style={styles.tableWrap}>
        {items.map((it, i) => (
          <Row key={i} style={styles.itemRow}>
            <Column>
              <Text style={styles.itemTitle}>{it.title}</Text>
              {it.variant ? <Text style={styles.itemMeta}>{it.variant}</Text> : null}
              <Text style={styles.itemMeta}>
                Qty {it.quantity} × {m(it.unitPriceCents)}
              </Text>
            </Column>
            <Column style={{ textAlign: 'right', verticalAlign: 'top', width: '96px' }}>
              <Text style={styles.itemTotal}>{m(it.lineTotalCents)}</Text>
            </Column>
          </Row>
        ))}
      </Section>

      <Hr style={styles.hr} />
      <TotalsRow label="Subtotal" value={m(props.subtotalCents)} />
      {props.discountCents > 0 ? (
        <TotalsRow label="Discount" value={`−${m(props.discountCents)}`} />
      ) : null}
      <TotalsRow label="Shipping" value={m(props.shippingCents)} />
      {props.taxCents > 0 ? <TotalsRow label="Tax" value={m(props.taxCents)} /> : null}
      <Hr style={styles.hr} />
      <TotalsRow label="Total" value={m(props.totalCents)} strong />

      <Cta href={orderUrl} label="View your order" />
    </BaseLayout>
  );
}

function TotalsRow({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <Row>
      <Column>
        <Text style={strong ? styles.totalLabelStrong : styles.totalLabel}>{label}</Text>
      </Column>
      <Column style={{ textAlign: 'right' }}>
        <Text style={strong ? styles.totalValueStrong : styles.totalValue}>{value}</Text>
      </Column>
    </Row>
  );
}

export interface ShippingUpdateProps {
  branding: EmailBranding;
  orderNumber: string;
  carrier: string;
  trackingNumber: string;
  trackingUrl: string | null;
  orderUrl: string;
}
export function ShippingUpdate({
  branding,
  orderNumber,
  carrier,
  trackingNumber,
  trackingUrl,
  orderUrl,
}: ShippingUpdateProps) {
  return (
    <BaseLayout branding={branding} preview={`Order ${orderNumber} has shipped`}>
      <Heading style={styles.h1}>Your order is on its way 📦</Heading>
      <Lead>
        Order <strong>{orderNumber}</strong> has shipped via {carrier}.
      </Lead>
      <Section style={styles.infoPanel}>
        <Text style={styles.infoLabel}>Carrier</Text>
        <Text style={styles.infoValue}>{carrier}</Text>
        <Text style={styles.infoLabel}>Tracking number</Text>
        <Text style={styles.infoValue}>{trackingNumber}</Text>
      </Section>
      <Cta href={trackingUrl ?? orderUrl} label={trackingUrl ? 'Track shipment' : 'View order'} />
    </BaseLayout>
  );
}

export interface OrderStatusProps {
  branding: EmailBranding;
  orderNumber: string;
  headline: string;
  message: string;
  orderUrl: string;
}
export function OrderStatus({
  branding,
  orderNumber,
  headline,
  message,
  orderUrl,
}: OrderStatusProps) {
  return (
    <BaseLayout branding={branding} preview={`${orderNumber}: ${headline}`}>
      <Heading style={styles.h1}>{headline}</Heading>
      <Lead>{message}</Lead>
      <Cta href={orderUrl} label="View your order" />
    </BaseLayout>
  );
}

export interface RefundProps {
  branding: EmailBranding;
  orderNumber: string;
  amountCents: number;
  currency: string;
  orderUrl: string;
}
export function Refund({
  branding,
  orderNumber,
  amountCents,
  currency,
  orderUrl,
}: RefundProps) {
  return (
    <BaseLayout branding={branding} preview={`Refund processed for ${orderNumber}`}>
      <Heading style={styles.h1}>Your refund is on the way</Heading>
      <Lead>
        We’ve processed a refund of <strong>{formatMoney(amountCents, currency)}</strong>{' '}
        for order <strong>{orderNumber}</strong>. It may take a few business days to
        appear on your statement.
      </Lead>
      <Cta href={orderUrl} label="View your order" />
    </BaseLayout>
  );
}

// ───────────────────────────── Cart recovery ────────────────────────────────

export interface AbandonedCartProps {
  branding: EmailBranding;
  firstName: string | null;
  itemCount: number;
  cartUrl: string;
}
export function AbandonedCart({
  branding,
  firstName,
  itemCount,
  cartUrl,
}: AbandonedCartProps) {
  return (
    <BaseLayout branding={branding} preview="You left something behind">
      <Heading style={styles.h1}>Still thinking it over?</Heading>
      <Lead>
        {firstName ? `Hi ${firstName}, ` : ''}you left {itemCount}{' '}
        {itemCount === 1 ? 'item' : 'items'} in your cart. We saved it for you — pick up
        right where you left off.
      </Lead>
      <Cta href={cartUrl} label="Return to cart" />
    </BaseLayout>
  );
}

// ───────────────────────────── Admin alerts ─────────────────────────────────

export interface AdminAlertProps {
  branding: EmailBranding;
  heading: string;
  message: string;
  ctaLabel?: string;
  ctaUrl?: string;
}
export function AdminAlert({
  branding,
  heading,
  message,
  ctaLabel,
  ctaUrl,
}: AdminAlertProps) {
  return (
    <BaseLayout branding={branding} preview={heading}>
      <Heading style={styles.h1}>{heading}</Heading>
      <Lead>{message}</Lead>
      {ctaLabel && ctaUrl ? <Cta href={ctaUrl} label={ctaLabel} /> : null}
    </BaseLayout>
  );
}

// ──────────────────────────────── Styles ────────────────────────────────────
// Inline, table-friendly styles derived entirely from the brand theme.

const styles = {
  body: {
    backgroundColor: t.colors.pageBg,
    color: t.colors.text,
    fontFamily: t.fonts.body,
    margin: 0,
    padding: '24px 0',
  } as React.CSSProperties,
  container: {
    maxWidth: '600px',
    margin: '0 auto',
    padding: '0 16px',
  } as React.CSSProperties,
  header: { padding: '8px 0 20px', textAlign: 'center' } as React.CSSProperties,
  wordmark: {
    fontFamily: t.fonts.heading,
    fontSize: '24px',
    color: t.colors.primary,
    margin: 0,
  } as React.CSSProperties,
  card: {
    backgroundColor: t.colors.card,
    border: `1px solid ${t.colors.border}`,
    borderRadius: `${t.radiusPx}px`,
    padding: '32px',
  } as React.CSSProperties,
  h1: {
    fontFamily: t.fonts.heading,
    fontSize: '22px',
    lineHeight: '28px',
    color: t.colors.heading,
    margin: '0 0 12px',
  } as React.CSSProperties,
  lead: {
    fontSize: '15px',
    lineHeight: '24px',
    color: t.colors.text,
    margin: '0 0 8px',
  } as React.CSSProperties,
  small: {
    fontSize: '13px',
    lineHeight: '20px',
    color: t.colors.muted,
    margin: '12px 0 0',
  } as React.CSSProperties,
  button: {
    display: 'inline-block',
    backgroundColor: t.colors.primary,
    color: t.colors.primaryFg,
    fontSize: '15px',
    fontWeight: 600,
    textDecoration: 'none',
    padding: '12px 28px',
    borderRadius: `${t.radiusPx}px`,
  } as React.CSSProperties,
  hr: { borderColor: t.colors.border, margin: '16px 0' } as React.CSSProperties,
  tableWrap: { margin: '20px 0 4px' } as React.CSSProperties,
  itemRow: { borderBottom: `1px solid ${t.colors.subtle}` } as React.CSSProperties,
  itemTitle: {
    fontSize: '14px',
    fontWeight: 600,
    color: t.colors.heading,
    margin: '0 0 2px',
  } as React.CSSProperties,
  itemMeta: {
    fontSize: '13px',
    color: t.colors.muted,
    margin: 0,
  } as React.CSSProperties,
  itemTotal: {
    fontSize: '14px',
    fontWeight: 600,
    color: t.colors.heading,
    margin: 0,
  } as React.CSSProperties,
  totalLabel: {
    fontSize: '14px',
    color: t.colors.muted,
    margin: '2px 0',
  } as React.CSSProperties,
  totalValue: {
    fontSize: '14px',
    color: t.colors.text,
    margin: '2px 0',
  } as React.CSSProperties,
  totalLabelStrong: {
    fontSize: '16px',
    fontWeight: 700,
    color: t.colors.heading,
    margin: '2px 0',
  } as React.CSSProperties,
  totalValueStrong: {
    fontSize: '16px',
    fontWeight: 700,
    color: t.colors.heading,
    margin: '2px 0',
  } as React.CSSProperties,
  infoPanel: {
    backgroundColor: t.colors.subtle,
    borderRadius: `${t.radiusPx}px`,
    padding: '16px 20px',
    margin: '16px 0',
  } as React.CSSProperties,
  infoLabel: {
    fontSize: '12px',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: t.colors.muted,
    margin: '8px 0 0',
  } as React.CSSProperties,
  infoValue: {
    fontSize: '15px',
    fontWeight: 600,
    color: t.colors.heading,
    margin: '2px 0 0',
  } as React.CSSProperties,
  footer: { padding: '20px 8px', textAlign: 'center' } as React.CSSProperties,
  footerText: {
    fontSize: '13px',
    color: t.colors.text,
    margin: '0 0 4px',
  } as React.CSSProperties,
  footerMuted: {
    fontSize: '12px',
    color: t.colors.muted,
    margin: '0 0 4px',
  } as React.CSSProperties,
  footerLink: { color: t.colors.primary, textDecoration: 'underline' } as React.CSSProperties,
};
