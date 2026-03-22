// ═══════════════════════════════════════════════════════
//  ChoreQuest — Game Data (Characters, Store Items, Levels)
// ═══════════════════════════════════════════════════════

export const CHARACTERS = [
  { id: "fox",     name: "Fox Warrior",    emoji: "🦊", img: "images/char_fox.png" },
  { id: "wolf",    name: "Arctic Wolf",    emoji: "🐺", img: "images/char_wolf.png" },
  { id: "dragon",  name: "Baby Dragon",    emoji: "🐉", img: "images/char_dragon.png" },
  { id: "panda",   name: "Jolly Panda",    emoji: "🐼", img: "images/char_panda.png" },
  { id: "owl",     name: "Owl Wizard",     emoji: "🦉", img: "images/char_owl.png" },
  { id: "bunny",   name: "Bunny Knight",   emoji: "🐰", img: "images/char_bunny.png" },
  { id: "raccoon", name: "Raccoon Rogue",  emoji: "🦝", img: "images/char_raccoon.png" },
  { id: "lion",    name: "Lion King",      emoji: "🦁", img: null },
  { id: "cat",     name: "Space Cat",      emoji: "🐱", img: null },
  { id: "dino",    name: "Friendly Dino",  emoji: "🦖", img: null },
  { id: "unicorn", name: "Magic Unicorn",  emoji: "🦄", img: null },
  { id: "bear",    name: "Bear Warrior",   emoji: "🐻", img: null },
  { id: "turtle",  name: "Turtle Sage",    emoji: "🐢", img: null },
  { id: "dolphin", name: "Wave Rider",     emoji: "🐬", img: null },
  { id: "phoenix", name: "Fire Phoenix",   emoji: "🔥", img: null },
  { id: "panther", name: "Shadow Panther", emoji: "🐈‍⬛", img: null },
  { id: "penguin", name: "Cool Penguin",   emoji: "🐧", img: null },
  { id: "monkey",  name: "Monkey Mage",    emoji: "🐵", img: null },
  { id: "eagle",   name: "Sky Eagle",      emoji: "🦅", img: null },
  { id: "robot",   name: "Robo Buddy",     emoji: "🤖", img: null },
];

export const STORE_ITEMS = [
  // ── Outfits ──
  { id: "outfit_king_cape",    name: "King's Cape",       category: "outfit",    price: 100,  rarity: "common",    requiredLevel: 1,  emoji: "👑", img: null, desc: "A royal red cape fit for a king." },
  { id: "outfit_ninja",        name: "Ninja Suit",        category: "outfit",    price: 200,  rarity: "uncommon",  requiredLevel: 3,  emoji: "🥷", img: null, desc: "Silent and deadly. All black everything." },
  { id: "outfit_space",        name: "Space Suit",        category: "outfit",    price: 350,  rarity: "rare",      requiredLevel: 7,  emoji: "🚀", img: null, desc: "Ready for interstellar chore missions." },
  { id: "outfit_wizard",       name: "Wizard Robe",       category: "outfit",    price: 250,  rarity: "uncommon",  requiredLevel: 5,  emoji: "🧙", img: null, desc: "Purple robes embroidered with silver stars." },
  { id: "outfit_pirate",       name: "Pirate Outfit",     category: "outfit",    price: 300,  rarity: "rare",      requiredLevel: 6,  emoji: "🏴‍☠️", img: null, desc: "Arr! Includes a stylish captain's hat." },
  { id: "outfit_superhero",    name: "Hero Suit",         category: "outfit",    price: 500,  rarity: "legendary", requiredLevel: 10, emoji: "🦸", img: null, desc: "With great chores comes great responsibility." },

  // ── Armor ──
  { id: "armor_gold",          name: "Golden Armor",      category: "armor",     price: 400,  rarity: "rare",      requiredLevel: 8,  emoji: "🛡️", img: null, desc: "Shining gold plate with emerald gems." },
  { id: "armor_ice",           name: "Crystal Ice Armor", category: "armor",     price: 300,  rarity: "uncommon",  requiredLevel: 5,  emoji: "🧊", img: null, desc: "Forged from enchanted glacial ice." },
  { id: "armor_dragon",        name: "Dragon Scale",      category: "armor",     price: 600,  rarity: "legendary", requiredLevel: 12, emoji: "🐲", img: null, desc: "Impenetrable scales of an ancient dragon." },
  { id: "armor_shadow",        name: "Shadow Plate",      category: "armor",     price: 350,  rarity: "rare",      requiredLevel: 7,  emoji: "🌑", img: null, desc: "Dark armor inscribed with glowing runes." },
  { id: "armor_bronze",        name: "Bronze Guard",      category: "armor",     price: 150,  rarity: "common",    requiredLevel: 2,  emoji: "🏛️", img: null, desc: "Sturdy ancient gladiator armor." },
  { id: "armor_mech",          name: "Mech Suit",         category: "armor",     price: 800,  rarity: "legendary", requiredLevel: 15, emoji: "🤖", img: null, desc: "Futuristic power armor with neon lights." },

  // ── Weapons ──
  { id: "weapon_crystal_sword",name: "Crystal Sword",     category: "weapon",    price: 250,  rarity: "uncommon",  requiredLevel: 4,  emoji: "🗡️", img: null, desc: "A blade of pure crystallized energy." },
  { id: "weapon_fire_staff",   name: "Fire Staff",        category: "weapon",    price: 300,  rarity: "rare",      requiredLevel: 6,  emoji: "🔥", img: null, desc: "A staff crowned with eternal flame." },
  { id: "weapon_thunder",      name: "Thunder Hammer",    category: "weapon",    price: 500,  rarity: "legendary", requiredLevel: 10, emoji: "⚡", img: null, desc: "Calls down lightning with every swing." },
  { id: "weapon_shadow_dag",   name: "Shadow Daggers",    category: "weapon",    price: 200,  rarity: "uncommon",  requiredLevel: 3,  emoji: "🔪", img: null, desc: "Twin blades that move like whispers." },
  { id: "weapon_rainbow_bow",  name: "Rainbow Bow",       category: "weapon",    price: 350,  rarity: "rare",      requiredLevel: 7,  emoji: "🏹", img: null, desc: "Fires arrows that trail sparkles." },
  { id: "weapon_star_wand",    name: "Star Wand",         category: "weapon",    price: 150,  rarity: "common",    requiredLevel: 1,  emoji: "⭐", img: null, desc: "A golden wand tipped with a star." },

  // ── Accessories ──
  { id: "acc_angel_wings",     name: "Angel Wings",       category: "accessory", price: 400,  rarity: "rare",      requiredLevel: 8,  emoji: "😇", img: null, desc: "White feathery wings that glow softly." },
  { id: "acc_dragon_wings",    name: "Dragon Wings",      category: "accessory", price: 500,  rarity: "legendary", requiredLevel: 11, emoji: "🪽", img: null, desc: "Crimson bat-like wings of power." },
  { id: "acc_star_crown",      name: "Crown of Stars",    category: "accessory", price: 300,  rarity: "rare",      requiredLevel: 6,  emoji: "👑", img: null, desc: "A floating crown orbited by tiny stars." },
  { id: "acc_flame_aura",      name: "Flame Aura",        category: "accessory", price: 600,  rarity: "legendary", requiredLevel: 13, emoji: "🔥", img: null, desc: "A blazing aura of orange fire energy." },
  { id: "acc_pet_dragon",      name: "Pet Dragon",        category: "accessory", price: 700,  rarity: "legendary", requiredLevel: 15, emoji: "🐉", img: null, desc: "A tiny loyal dragon companion." },
  { id: "acc_halo",            name: "Golden Halo",       category: "accessory", price: 200,  rarity: "uncommon",  requiredLevel: 3,  emoji: "✨", img: null, desc: "A glowing halo that floats above." },
];

// ── Level Thresholds ──
// Level = floor(sqrt(totalLifetimePoints / 25)) + 1, capped at 50
export function getLevel(totalLifetimePoints) {
  return Math.min(50, Math.floor(Math.sqrt((totalLifetimePoints || 0) / 25)) + 1);
}

export function getLevelTier(level) {
  if (level >= 30) return "diamond";
  if (level >= 15) return "gold";
  if (level >= 7)  return "silver";
  return "bronze";
}

export function getNextLevelPoints(currentLevel) {
  if (currentLevel >= 50) return Infinity;
  const target = currentLevel; // next level number = currentLevel + 1, threshold = (target)^2 * 25
  return target * target * 25;
}

// ── Streak Milestones ──
export const STREAK_BONUSES = {
  3:  50,
  5:  100,
  7:  200,
  14: 500,
  30: 1000,
};

export function getCharById(id) {
  return CHARACTERS.find(c => c.id === id) || CHARACTERS[0];
}

export function getItemById(id) {
  return STORE_ITEMS.find(i => i.id === id);
}
