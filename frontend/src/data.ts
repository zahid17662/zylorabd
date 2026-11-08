export const SIZES = ['S', 'M', 'L', 'XL', 'XXL', 'Free Size'] as const
export type Size = (typeof SIZES)[number]

export type Product = {
  id: string
  title: string
  /** Category label shown under the title, as in the reference cards */
  category: string
  price: number
  salePrice?: number
  image: string
  /** Stock per size; 0 means sold out for that size. */
  stock: Partial<Record<Size, number>>
  /** Backend variant id per size, needed to place orders. */
  variantIds: Partial<Record<Size, string>>
  description: string
  /** Every gallery image, first one is the cover. */
  images: string[]
  /** Showcase video (MP4/WebM on the CDN), if the admin uploaded one. */
  video?: string
}

/** Bangladeshi mobile number, with or without +88 / 88 prefix. */
export const BD_PHONE = /^(?:\+?88)?01[3-9]\d{8}$/
export const isBdPhone = (v: string): boolean => BD_PHONE.test(v.trim().replace(/[\s-]/g, ''))

export const img = (id: string, w = 600, h?: number) => {
  const base = id.startsWith('http') ? id.split('?')[0] : `https://images.unsplash.com/photo-${id}`
  return `${base}?auto=format&fit=crop&w=${w}${h ? `&h=${h}` : ''}&q=80`
}

/* ---------- offline catalog (mirrors backend/seed.py) ---------- */
const UNSPLASH = 'https://images.unsplash.com/photo-'
const SOLD_OUT: Product['stock'] = { S: 0, M: 0, L: 0, XL: 0, XXL: 0 }

const fallback = (
  n: number,
  title: string,
  category: string,
  price: number,
  discount: number,
  photo: string,
  stock: Product['stock'],
): Product => ({
  id: `fallback-${n}`,
  title,
  category,
  price,
  salePrice: discount > 0 ? Math.round(price * (1 - discount / 100)) : undefined,
  image: UNSPLASH + photo,
  images: [UNSPLASH + photo],
  stock,
  // No backend variant ids offline: checkout waits for the live catalog.
  variantIds: {},
  description: '',
})

/** Shown instantly and whenever the API is unreachable (cold start, offline, dev without backend). */
export const FALLBACK_PRODUCTS: Product[] = [
  fallback(1, 'Noor Embroidered Tiered Kurti', 'Kurti', 1850, 0, '1760287363878-1a09af715b80', { S: 3, M: 6, L: 5, XL: 2, XXL: 1 }),
  fallback(2, 'Noir Sleeveless Shell Top', 'Western', 1350, 0, '1519554318711-aaf73ece6ff9', SOLD_OUT),
  fallback(3, 'Mocha Relaxed Fit Shirt', 'Western', 1450, 0, '1776838103951-993ff1ffc916', { S: 4, M: 7, L: 6, XL: 3, XXL: 0 }),
  fallback(4, 'Blossom Floral Sundress | Limited Edition', 'Western', 2250, 25, '1585129357576-aa4da9a68970', { S: 2, M: 4, L: 3, XL: 1, XXL: 0 }),
  fallback(5, 'Paisley Night Long Kurti', 'Kurti', 2150, 20, '1760287364219-160c234ded00', { S: 2, M: 0, L: 3, XL: 1, XXL: 0 }),
  fallback(6, 'Rose Lattice Two-Piece Set', 'Three Piece', 2890, 0, '1764271692129-767f58952c26', { S: 2, M: 3, L: 2, XL: 2, XXL: 1 }),
  fallback(7, 'Rose Garden Embellished Gown', 'Gowns', 3450, 40, '1735553816887-95a2657d5fd8', { S: 1, M: 2, L: 2, XL: 1, XXL: 0 }),
  fallback(8, 'Mehrun Embroidered Red Kurti', 'Kurti', 3250, 0, '1760287364328-e30221615f2e', { S: 1, M: 3, L: 4, XL: 2, XXL: 1 }),
  fallback(9, 'Ivory Lace Sleeveless Dress', 'Western', 1690, 30, '1591221662157-6f62de5508eb', { S: 9, M: 12, L: 10, XL: 6, XXL: 3 }),
  fallback(10, 'Heritage Tweed Shift Dress', 'Western', 1650, 0, '1772909566980-b06731149511', { S: 3, M: 4, L: 2, XL: 1, XXL: 0 }),
  fallback(11, 'Tan Leather Shoulder Bag', 'Accessories', 2450, 20, '1691480150204-66dd1eb77391', { 'Free Size': 8 }),
  fallback(12, 'Gold Drop Jhumka Earrings', 'Accessories', 890, 0, '1705326453282-e4e1b78f5fea', { 'Free Size': 18 }),
]

/** "৳ 1,950.00" — WooCommerce style price */
export const taka = (n: number) =>
  `৳\u00a0${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export const collections = [
  { name: 'Kurti', sub: 'Ethnic Collection', image: '1760287364328-e30221615f2e' },
  { name: 'Western', sub: 'The Everyday Edit', image: '1495121605193-b116b5b9c5fe' },
  { name: 'Accessories', sub: 'Jewellery & Bags', image: '1606760227091-3dd870d97f1d' },
]

/* "Explore a selection of creations" carousel */
export const creations = [
  { name: 'Kurtis', image: '1760287363878-1a09af715b80' },
  { name: 'Three Piece', image: '1764271692129-767f58952c26' },
  { name: 'Gowns', image: '1735553816887-95a2657d5fd8' },
  { name: 'Western Wear', image: '1544586947-3e09d1a036f1' },
  { name: 'Tops & Blouses', image: '1612423284934-2850a4ea6b0f' },
  { name: 'Handbags', image: '1691480150204-66dd1eb77391' },
  { name: 'Jewellery', image: '1705326453282-e4e1b78f5fea' },
]

export const services = [
  {
    title: 'Pay Your Way',
    text: 'Cash on Delivery anywhere in Bangladesh, or pay instantly with bKash, Nagad and cards.',
    cta: 'Payment options',
    image: '1732613842478-8a61050fe18e',
  },
  {
    title: 'Personal Styling',
    text: 'Unsure of a size or colour? Our stylists will help you on WhatsApp or by phone, 10am–10pm.',
    cta: 'Book a consultation',
    image: '1490481651871-ab68de25d43d',
  },
  {
    title: 'The Art of Gifting',
    text: 'Every order arrives in our signature box. Add a handwritten note for someone special.',
    cta: 'Discover gifting',
    image: '1780299510917-d56599b5a8b6',
  },
]

export const reviews = [
  {
    name: 'Nusrat Jahan',
    when: '2 weeks ago',
    text: 'I bought an embroidered kurti and a three-piece from them. Did not disappoint at all. The fabric is soft and the stitching is neat. One of the best women’s clothing pages in BD. Highly recommended.',
  },
  {
    name: 'Farzana Rahman',
    when: '1 month ago',
    text: 'They are just amazing. I got exactly what I saw in the video. Delivery inside Dhaka took only one day. You can order from them without any doubt.',
  },
  {
    name: 'Tasnim Ahmed',
    when: '1 month ago',
    text: 'I ordered a co-ord set and a pair of earrings. I didn’t expect the quality to be this good — the set fits perfectly and the earrings are so lightweight. The staff is really responsive and helpful. I’m really satisfied.',
  },
  {
    name: 'Sabrina Islam',
    when: '2 months ago',
    text: 'Best quality products from Zylora. The Eid collection is gorgeous. Everyone should check it out!',
  },
  {
    name: 'Mehjabin Karim',
    when: '3 months ago',
    text: 'I have been following their page since they started. Out of curiosity I ordered a lawn three-piece and it turned out way better than I expected. Then I ordered a kurti and a handbag — all great. Money well spent.',
  },
  {
    name: 'Rumana Akter',
    when: '4 months ago',
    text: 'The size chart was spot on and they exchanged my size without any hassle. Paid with bKash and got the confirmation SMS instantly.',
  },
]
