// Picks an illustration for an item or category that has no photo of its own: a Lucide
// food/retail glyph on a tinted tile, chosen from keywords in the item / group name.
// Deliberately an illustration, not a stock photo — a photo of "a burger" on a different
// burger would misrepresent the dish. POS product cards show only the Item's own image (owner
// decision 2026-10-20); these glyphs are for category chips and the landing page's sample previews.
import type { Component } from 'vue'
import {
  Apple, Armchair, Baby, Beef, Beer, Book, Boxes, Brush, CakeSlice, Candy, Carrot, Cherry, Citrus, Coffee, Cookie, CookingPot,
  Croissant, CupSoda, Donut, Drumstick, Dumbbell, EggFried, Fish, Gem, Gift, Glasses, GlassWater, Grape, Hamburger, Headphones,
  IceCreamCone, Lamp, Laptop, LayoutGrid, Leaf, Martini, Milk, Package, Pen, Pill, Pizza, Popcorn, Salad, Sandwich, Shirt,
  ShoppingBasket, Smartphone, Soup, Sparkles, Star, UtensilsCrossed, Watch, Wheat, Wine, Footprints,
} from 'lucide-vue-next'

export type ArtTone = 'amber' | 'rose' | 'emerald' | 'sky' | 'violet' | 'orange' | 'teal' | 'slate' | 'blue' | 'lime'
export interface ItemArt { icon: Component; tone: ArtTone }

// First match wins, so specific words come before broad ones ("ice cream" before "cream").
const RULES: [RegExp, Component, ArtTone][] = [
  [/ice ?cream|gelato|sundae|kulfi|frozen yogh?urt/, IceCreamCone, 'rose'],
  [/coffee|espresso|latte|cappuccino|americano|mocha|macchiato|flat white|karak|qahwa|tea\b|chai|matcha/, Coffee, 'amber'],
  [/smoothie|shake|milkshake|lassi/, Milk, 'rose'],
  [/juice|lemonade|mojito|orange|citrus|lime/, Citrus, 'lime'],
  [/water|soda water|sparkling/, GlassWater, 'sky'],
  [/cola|soda|soft drink|pepsi|7 ?up|sprite|fanta|beverage|drink|iced/, CupSoda, 'sky'],
  [/beer|lager|\bale\b/, Beer, 'amber'],
  [/wine|champagne/, Wine, 'violet'],
  [/cocktail|martini|mocktail/, Martini, 'violet'],
  [/burger|slider/, Hamburger, 'orange'],
  [/pizza|calzone/, Pizza, 'orange'],
  [/sandwich|wrap|shawarma|sub\b|panini|toastie|club/, Sandwich, 'amber'],
  [/salad|greens|caesar|fattoush|tabbouleh/, Salad, 'emerald'],
  [/soup|broth|lentil|harira|ramen|pho/, Soup, 'orange'],
  [/biryani|machboos|rice|curry|stew|pasta|noodle|risotto|tagine|kabsa|mandi|main/, CookingPot, 'orange'],
  [/chicken|wing|tikka|tandoor|grill|shish|kebab|kabab|nugget/, Drumstick, 'amber'],
  [/fish|prawn|shrimp|seafood|salmon|hammour|calamari|sushi/, Fish, 'sky'],
  [/steak|beef|lamb|mutton|meat|ribs|brisket/, Beef, 'rose'],
  [/egg|omelet|breakfast|shakshuka|pancake|waffle/, EggFried, 'amber'],
  [/croissant|pastry|bakery|bread|bun|roll|bagel|manakish|zaatar|cheese bread/, Croissant, 'amber'],
  [/cake|cheesecake|brownie|dessert|sweet|kunafa|umm ali|pudding|tart|pie\b|basbousa/, CakeSlice, 'rose'],
  [/donut|doughnut/, Donut, 'rose'],
  [/cookie|biscuit/, Cookie, 'amber'],
  [/candy|chocolate|confection/, Candy, 'rose'],
  [/popcorn|chips|crisps|snack|fries|nachos/, Popcorn, 'amber'],
  [/fruit|apple|banana|berry|mango/, Apple, 'rose'],
  [/grape|\bdates?\b/, Grape, 'violet'],
  [/cherry/, Cherry, 'rose'],
  [/vegetable|veg\b|carrot|produce/, Carrot, 'orange'],
  [/vegan|organic|herb|leaf/, Leaf, 'emerald'],
  [/flour|grain|wheat|cereal|grocery|groceries/, Wheat, 'amber'],
  [/side|starter|appetizer|mezze|meze|platter/, UtensilsCrossed, 'teal'],
  // retail
  [/shirt|t-shirt|tee\b|apparel|clothing|clothes|dress|abaya|kandura|fashion|jacket|hoodie|garment/, Shirt, 'violet'],
  [/shoe|sneaker|footwear|sandal|boot/, Footprints, 'slate'],
  [/phone|mobile|charger|cable|electronic/, Smartphone, 'blue'],
  [/laptop|computer|tablet|keyboard|mouse/, Laptop, 'blue'],
  [/headphone|earbud|speaker|audio/, Headphones, 'slate'],
  [/watch/, Watch, 'slate'],
  [/glasses|sunglass|eyewear|optic/, Glasses, 'slate'],
  [/jewel|\bring\b|necklace|gold|diamond/, Gem, 'violet'],
  [/perfume|oud|fragrance|cosmetic|beauty|makeup|skincare|cream|lotion/, Sparkles, 'rose'],
  [/brush|cleaning|detergent|soap|household/, Brush, 'teal'],
  [/medicine|pharma|vitamin|pill|health/, Pill, 'teal'],
  [/sport|gym|fitness|dumbbell/, Dumbbell, 'slate'],
  [/baby|kids|toy/, Baby, 'sky'],
  [/book|notebook|magazine/, Book, 'blue'],
  [/pen\b|pencil|stationery|office|marker/, Pen, 'blue'],
  [/gift|voucher/, Gift, 'rose'],
  [/furniture|chair|sofa/, Armchair, 'amber'],
  [/lamp|light|decor/, Lamp, 'amber'],
  [/bundle|combo|box|pack/, Boxes, 'teal'],
  [/basket|retail|merch|product/, ShoppingBasket, 'teal'],
  [/special|signature|featured/, Star, 'amber'],
  [/food|meal|kitchen|dish|menu/, UtensilsCrossed, 'orange'],
  [/item|goods|stock|general|consumable|raw material|sub assembl/, Package, 'slate'],
]

const TONES: ArtTone[] = ['blue', 'teal', 'violet', 'amber', 'emerald', 'rose', 'sky', 'orange']

function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

/** Illustration for an item: its own name first, then its group; a neutral package otherwise. */
export function itemArt(name: string, group?: string | null): ItemArt {
  for (const text of [name, group || '']) {
    const s = text.toLowerCase()
    if (!s) continue
    for (const [re, icon, tone] of RULES) if (re.test(s)) return { icon, tone }
  }
  return { icon: Package, tone: TONES[hash(group || name) % TONES.length] }
}

/** Illustration for a category chip ("all" gets the grid icon). */
export function groupArt(group: string): ItemArt {
  if (group === 'all') return { icon: LayoutGrid, tone: 'slate' }
  return itemArt(group, null)
}
