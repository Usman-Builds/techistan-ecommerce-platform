import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../../prisma/prisma.service';
import { formatMoney } from '../../common';
import type { OrderActor } from './order.service';

/** Address snapshot shape (as stored on Order.shippingAddress / billingAddress). */
interface AddressSnapshot {
  fullName?: string;
  phone?: string;
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

/**
 * Branded, itemized invoice PDF (script 11, FR-509). Rendered server-side with
 * pdfkit into a Buffer and streamed as `application/pdf`. Totals come straight
 * from the order's integer-cent columns — never recomputed on the client.
 */
@Injectable()
export class InvoiceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Load the order (enforcing the same visibility rules as the read API) and
   * render its invoice. `admin` bypasses ownership; a customer may only fetch
   * their own order; a guest order is reachable by its unguessable id.
   */
  async generateInvoice(
    orderId: string,
    actor: OrderActor | null,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true, payments: { orderBy: { createdAt: 'desc' } } },
    });
    if (!order) throw new NotFoundException('Order not found');

    const isAdmin =
      actor?.role === Role.ADMIN || actor?.role === Role.SUPER_ADMIN;
    if (order.userId != null && !isAdmin && actor?.userId !== order.userId) {
      throw new NotFoundException('Order not found');
    }
    // A guest order (null userId) is reachable by id; a logged-in NON-owner
    // non-admin is blocked above. Nothing more to check.

    const buffer = await this.render(order);
    return { buffer, filename: `invoice-${order.orderNumber}.pdf` };
  }

  private render(order: {
    orderNumber: string;
    email: string;
    currency: string;
    subtotal: number;
    shippingTotal: number;
    taxTotal: number;
    discountTotal: number;
    grandTotal: number;
    couponCode: string | null;
    createdAt: Date;
    shippingAddress: unknown;
    billingAddress: unknown;
    items: Array<{
      productTitle: string;
      sku: string;
      variantOptions: unknown;
      quantity: number;
      unitPrice: number;
      total: number;
    }>;
    payments: Array<{ status: string; method: string | null }>;
  }): Promise<Buffer> {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];

    return new Promise<Buffer>((resolve, reject) => {
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const currency = order.currency;
      const money = (cents: number) => formatMoney(cents, currency);

      // ── Header ──
      doc
        .fillColor('#1d4ed8')
        .fontSize(24)
        .font('Helvetica-Bold')
        .text('Techistan', 50, 50);
      doc
        .fillColor('#111827')
        .fontSize(20)
        .text('INVOICE', 0, 50, { align: 'right' });
      doc
        .fillColor('#6b7280')
        .fontSize(10)
        .font('Helvetica')
        .text(`Order ${order.orderNumber}`, 0, 76, { align: 'right' })
        .text(
          `Date: ${new Date(order.createdAt).toLocaleDateString('en-US')}`,
          0,
          90,
          { align: 'right' },
        );

      doc.moveTo(50, 120).lineTo(545, 120).strokeColor('#e5e7eb').stroke();

      // ── Addresses ──
      const ship = (order.shippingAddress ?? {}) as AddressSnapshot;
      const bill = (order.billingAddress ?? {}) as AddressSnapshot;
      doc.fillColor('#111827').fontSize(11).font('Helvetica-Bold');
      doc.text('Ship to', 50, 138);
      doc.text('Bill to', 300, 138);
      doc.font('Helvetica').fillColor('#374151').fontSize(10);
      this.writeAddress(doc, ship, order.email, 50, 154);
      this.writeAddress(doc, bill, order.email, 300, 154);

      // ── Items table ──
      let y = 250;
      doc.fillColor('#111827').font('Helvetica-Bold').fontSize(10);
      doc.text('Item', 50, y);
      doc.text('Qty', 340, y, { width: 40, align: 'right' });
      doc.text('Unit', 400, y, { width: 60, align: 'right' });
      doc.text('Total', 470, y, { width: 75, align: 'right' });
      y += 16;
      doc.moveTo(50, y).lineTo(545, y).strokeColor('#e5e7eb').stroke();
      y += 8;

      doc.font('Helvetica').fillColor('#374151');
      for (const item of order.items) {
        const opts = this.describeOptions(item.variantOptions);
        const label = opts ? `${item.productTitle} (${opts})` : item.productTitle;
        doc.text(label, 50, y, { width: 280 });
        doc.text(String(item.quantity), 340, y, { width: 40, align: 'right' });
        doc.text(money(item.unitPrice), 400, y, { width: 60, align: 'right' });
        doc.text(money(item.total), 470, y, { width: 75, align: 'right' });
        const rows = Math.ceil(doc.widthOfString(label) / 280) || 1;
        y += 14 * rows + 4;
        doc.fillColor('#9ca3af').fontSize(8).text(`SKU ${item.sku}`, 50, y - 4);
        doc.fillColor('#374151').fontSize(10);
        y += 10;
      }

      // ── Totals ──
      y += 8;
      doc.moveTo(330, y).lineTo(545, y).strokeColor('#e5e7eb').stroke();
      y += 10;
      const totalRow = (label: string, value: string, bold = false) => {
        doc
          .font(bold ? 'Helvetica-Bold' : 'Helvetica')
          .fillColor(bold ? '#111827' : '#6b7280')
          .fontSize(bold ? 12 : 10);
        doc.text(label, 330, y, { width: 130, align: 'right' });
        doc.text(value, 470, y, { width: 75, align: 'right' });
        y += bold ? 20 : 16;
      };
      totalRow('Subtotal', money(order.subtotal));
      if (order.discountTotal > 0) {
        totalRow(
          order.couponCode ? `Discount (${order.couponCode})` : 'Discount',
          `-${money(order.discountTotal)}`,
        );
      }
      totalRow(
        'Shipping',
        order.shippingTotal === 0 ? 'Free' : money(order.shippingTotal),
      );
      totalRow('Tax', money(order.taxTotal));
      totalRow('Total', money(order.grandTotal), true);

      // ── Footer ──
      const payment = order.payments[0];
      doc
        .font('Helvetica')
        .fillColor('#6b7280')
        .fontSize(9)
        .text(
          `Payment: ${payment?.status ?? 'N/A'}${
            payment?.method ? ` · ${payment.method}` : ''
          }`,
          50,
          760,
        )
        .text('Thank you for shopping with Techistan.', 0, 760, {
          align: 'right',
        });

      doc.end();
    });
  }

  private writeAddress(
    doc: PDFKit.PDFDocument,
    addr: AddressSnapshot,
    email: string,
    x: number,
    y: number,
  ): void {
    const lines = [
      addr.fullName,
      addr.line1,
      addr.line2,
      [addr.city, addr.state, addr.postalCode].filter(Boolean).join(', '),
      addr.country,
      email,
    ].filter((l): l is string => Boolean(l && l.trim()));
    doc.text(lines.join('\n'), x, y, { width: 220 });
  }

  private describeOptions(raw: unknown): string {
    if (!raw || typeof raw !== 'object') return '';
    return Object.entries(raw as Record<string, unknown>)
      .map(([k, v]) => `${k}: ${String(v)}`)
      .join(', ');
  }
}
