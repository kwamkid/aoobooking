"use client";

import { useEffect, useState } from "react";

// HeroSlider — slideshow รูปโรงแรม (auto-play + fade + dots)
// รูปอยู่ public/onboarding/*.jpg (Unsplash License — ฟรีเชิงพาณิชย์)
const SLIDES = [
  { src: "/onboarding/1.jpg", caption: "จัดการห้องพักและการจองครบวงจร" },
  { src: "/onboarding/2.jpg", caption: "ตั้งราคาตามฤดูกาล คุมห้องไม่ให้ overbook" },
  { src: "/onboarding/3.jpg", caption: "เช็คอิน/เอาท์ · folio · รับชำระเงิน" },
  { src: "/onboarding/4.jpg", caption: "รายงานรายได้และ occupancy" },
];
const INTERVAL = 5000;

export function HeroSlider() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setIndex((i) => (i + 1) % SLIDES.length), INTERVAL);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="relative h-full w-full overflow-hidden bg-brand">
      {/* รูป — fade ระหว่างสไลด์ */}
      {SLIDES.map((s, i) => (
        <div
          key={s.src}
          className={`absolute inset-0 transition-opacity duration-1000 ${
            i === index ? "opacity-100" : "opacity-0"
          }`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={s.src} alt="" className="h-full w-full object-cover" />
          {/* overlay brand → อ่านข้อความได้ + คุมโทนให้เข้าธีม */}
          <div className="absolute inset-0 bg-brand/55" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
        </div>
      ))}

      {/* เนื้อหาทับรูป */}
      <div className="relative z-10 flex h-full flex-col justify-between p-10 text-white xl:p-14">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/aoobooking-logo.svg"
            alt="AooBooking"
            width={44}
            height={44}
            className="h-11 w-11 brightness-0 invert"
          />
          <span className="text-xl font-bold">AooBooking</span>
        </div>

        <div>
          <h2 className="mb-3 text-3xl font-bold leading-tight xl:text-4xl">
            ยินดีต้อนรับสู่
            <br />
            ระบบจัดการโรงแรม
          </h2>
          <p className="min-h-12 max-w-md text-white/85 transition-opacity duration-500">
            {SLIDES[index].caption}
          </p>

          {/* dots */}
          <div className="mt-6 flex gap-2">
            {SLIDES.map((s, i) => (
              <button
                key={s.src}
                onClick={() => setIndex(i)}
                aria-label={`สไลด์ ${i + 1}`}
                className={`h-1.5 rounded-full transition-all ${
                  i === index ? "w-8 bg-white" : "w-4 bg-white/40 hover:bg-white/60"
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
