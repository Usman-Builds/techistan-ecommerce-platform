"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CouponForm } from "@/components/promotions/CouponForm";

export default function NewCouponPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link
        href="/coupons"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> Back to coupons
      </Link>
      <h1 className="font-heading text-2xl font-bold">New coupon</h1>
      <CouponForm mode="create" />
    </div>
  );
}
