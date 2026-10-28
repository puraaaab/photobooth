const path = require('path');

const userUploadDir = 'C:/Users/purab/.gemini/antigravity-ide/brain/9637d912-5234-47ab-8746-30b4ac70c69a/.user_uploaded';
const STICKERS_DIR = 'c:/projects/Photobooth/public/stickers';

const STICKER_DEFINITIONS = [
  // ── Sheet 1: media_1790156903981.png (576x1024) ──
  {
    file: 'media_1790156903981.png',
    id: 'exit-sign',
    name: 'Vintage Exit Sign',
    category: 'retro',
    tags: ['sign', 'retro', 'arrow', 'exit'],
    approxBox: { left: 10, top: 15, width: 205, height: 315 }
  },
  {
    file: 'media_1790156903981.png',
    id: 'headphones',
    name: 'DJ Headphones',
    category: 'music_misc',
    tags: ['music', 'audio', 'sound', 'headphones'],
    approxBox: { left: 230, top: 10, width: 130, height: 125 }
  },
  {
    file: 'media_1790156903981.png',
    id: 'astronaut-plane',
    name: 'Paper Plane Astronaut',
    category: 'pop_culture',
    tags: ['space', 'astronaut', 'fly', 'plane'],
    approxBox: { left: 280, top: 5, width: 295, height: 245 }
  },
  {
    file: 'media_1790156903981.png',
    id: 'bugs-bunny',
    name: "Bugs Bunny What's Up Doc",
    category: 'pop_culture',
    tags: ['cartoon', 'bunny', 'looney', 'badge'],
    approxBox: { left: 135, top: 135, width: 205, height: 205 }
  },
  {
    file: 'media_1790156903981.png',
    id: 'cinema-ticket',
    name: 'Admit One Cinema Ticket',
    category: 'retro',
    tags: ['movie', 'ticket', 'cinema', 'vintage'],
    approxBox: { left: 360, top: 205, width: 195, height: 110 }
  },
  {
    file: 'media_1790156903981.png',
    id: 'basf-cassette',
    name: 'BASF Tape Cassette',
    category: 'retro',
    tags: ['cassette', 'tape', 'music', '80s', 'analog'],
    approxBox: { left: 20, top: 340, width: 105, height: 155 }
  },
  {
    file: 'media_1790156903981.png',
    id: 'spiderman-badge',
    name: 'Spider-Man Mask Badge',
    category: 'pop_culture',
    tags: ['marvel', 'spiderman', 'superhero', 'comic'],
    approxBox: { left: 165, top: 360, width: 175, height: 175 }
  },
  {
    file: 'media_1790156903981.png',
    id: 'main-character-clapper',
    name: 'Main Character Clapperboard',
    category: 'pop_culture',
    tags: ['movie', 'hollywood', 'clapper', 'cinema'],
    approxBox: { left: 370, top: 330, width: 125, height: 110 }
  },
  {
    file: 'media_1790156903981.png',
    id: 'apple-music-icon',
    name: 'Apple Music Note',
    category: 'music_misc',
    tags: ['music', 'icon', 'apple', 'song'],
    approxBox: { left: 450, top: 445, width: 120, height: 120 }
  },
  {
    file: 'media_1790156903981.png',
    id: 'ghostface-busters',
    name: 'Ghostface Scream Busters',
    category: 'pop_culture',
    tags: ['horror', 'scream', 'ghostbusters', 'halloween'],
    approxBox: { left: 15, top: 510, width: 215, height: 195 }
  },
  {
    file: 'media_1790156903981.png',
    id: 'one-piece-skull',
    name: 'Straw Hat Pirate Skull',
    category: 'pop_culture',
    tags: ['anime', 'onepiece', 'luffy', 'pirate'],
    approxBox: { left: 295, top: 525, width: 150, height: 130 }
  },
  {
    file: 'media_1790156903981.png',
    id: 'air-jordans',
    name: 'Nike Air Jordan 1 Chicagos',
    category: 'streetwear',
    tags: ['sneakers', 'jordan', 'shoes', 'hypebeast'],
    approxBox: { left: 180, top: 605, width: 185, height: 235 }
  },
  {
    file: 'media_1790156903981.png',
    id: 'yankees-cap',
    name: 'NY Yankees Fitted Cap',
    category: 'streetwear',
    tags: ['hat', 'cap', 'newyork', 'baseball', 'streetwear'],
    approxBox: { left: 350, top: 625, width: 220, height: 170 }
  },
  {
    file: 'media_1790156903981.png',
    id: 'checkered-flags',
    name: 'Finish Line Checkered Flags',
    category: 'motorsport',
    tags: ['racing', 'flags', 'finish', 'car'],
    approxBox: { left: 5, top: 690, width: 140, height: 160 }
  },
  {
    file: 'media_1790156903981.png',
    id: 'just-do-it',
    name: 'Nike Just Do It',
    category: 'streetwear',
    tags: ['nike', 'slogan', 'sport', 'quote'],
    approxBox: { left: 135, top: 775, width: 195, height: 145 }
  },
  {
    file: 'media_1790156903981.png',
    id: 'vans-logo',
    name: 'Vans Off The Wall',
    category: 'streetwear',
    tags: ['vans', 'skate', 'logo', 'streetwear'],
    approxBox: { left: 280, top: 805, width: 185, height: 200 }
  },
  {
    file: 'media_1790156903981.png',
    id: 'skyline-gtr-r34',
    name: 'Nissan Skyline GT-R R34',
    category: 'motorsport',
    tags: ['jdm', 'skyline', 'gtr', 'fastandfurious', 'car'],
    approxBox: { left: 10, top: 845, width: 265, height: 145 }
  },
  {
    file: 'media_1790156903981.png',
    id: 'skateboard-checker',
    name: 'Checkered Skateboard Deck',
    category: 'streetwear',
    tags: ['skateboard', 'skate', 'deck', 'extreme'],
    approxBox: { left: 430, top: 765, width: 140, height: 245 }
  },

  // ── Sheet 2: media_1790156912531.png (576x1024) ──
  {
    file: 'media_1790156912531.png',
    id: 'porsche-911-poster',
    name: 'Porsche 911 Unleash The Legend',
    category: 'motorsport',
    tags: ['porsche', '911', 'supercar', 'classic'],
    approxBox: { left: 100, top: 5, width: 200, height: 250 }
  },
  {
    file: 'media_1790156912531.png',
    id: 'classic-garage-sign',
    name: 'Classic Garage Muscle Car',
    category: 'motorsport',
    tags: ['garage', 'musclecar', 'retro', 'hotrod'],
    approxBox: { left: 350, top: 5, width: 220, height: 235 }
  },
  {
    file: 'media_1790156912531.png',
    id: 'red-dice',
    name: 'Lucky Red Casino Dice',
    category: 'music_misc',
    tags: ['dice', 'casino', 'lucky', 'red', 'game'],
    approxBox: { left: 5, top: 275, width: 155, height: 175 }
  },
  {
    file: 'media_1790156912531.png',
    id: 'poker-aces',
    name: 'Bloody Four Aces Poker Hand',
    category: 'music_misc',
    tags: ['cards', 'poker', 'aces', 'gambling'],
    approxBox: { left: 180, top: 275, width: 200, height: 145 }
  },
  {
    file: 'media_1790156912531.png',
    id: 'electric-guitar',
    name: 'Red Electric Guitar',
    category: 'music_misc',
    tags: ['guitar', 'rock', 'music', 'instrument'],
    approxBox: { left: 390, top: 235, width: 180, height: 185 }
  },
  {
    file: 'media_1790156912531.png',
    id: 'vivienne-westwood',
    name: 'Vivienne Westwood Label',
    category: 'streetwear',
    tags: ['fashion', 'designer', 'label', 'streetwear'],
    approxBox: { left: 15, top: 625, width: 195, height: 165 }
  },
  {
    file: 'media_1790156912531.png',
    id: 'marlboro-juice',
    name: 'Japanese Marlboro Juice Box',
    category: 'retro',
    tags: ['anime', 'juice', 'retro', 'japan', 'y2k'],
    approxBox: { left: 210, top: 445, width: 225, height: 275 }
  },
  {
    file: 'media_1790156912531.png',
    id: 'spider-emblem',
    name: 'Spider Hero Back Emblem',
    category: 'pop_culture',
    tags: ['spider', 'marvel', 'hero', 'badge'],
    approxBox: { left: 440, top: 510, width: 130, height: 175 }
  },
  {
    file: 'media_1790156912531.png',
    id: 'coca-cola-pack',
    name: 'Coca-Cola 6-Pack Bottles',
    category: 'retro',
    tags: ['coke', 'cocacola', 'vintage', 'soda'],
    approxBox: { left: 160, top: 740, width: 205, height: 265 }
  },
  {
    file: 'media_1790156912531.png',
    id: 'porsche-911-rear',
    name: 'Porsche 911 Turbo Widebody',
    category: 'motorsport',
    tags: ['porsche', 'turbo', 'widebody', 'car'],
    approxBox: { left: 360, top: 680, width: 215, height: 130 }
  },

  // ── Sheet 3: media_1790156920149.png (576x1024) ──
  {
    file: 'media_1790156920149.png',
    id: 'cat-astronaut',
    name: 'Space Cat Cosmonaut',
    category: 'pop_culture',
    tags: ['cat', 'astronaut', 'space', 'retro'],
    approxBox: { left: 45, top: 15, width: 215, height: 255 }
  },
  {
    file: 'media_1790156920149.png',
    id: 'rolling-stones-tongue',
    name: 'The Sticky Fingers Tongue Badge',
    category: 'music_misc',
    tags: ['rock', 'stones', 'tongue', 'band'],
    approxBox: { left: 310, top: 10, width: 260, height: 260 }
  },
  {
    file: 'media_1790156920149.png',
    id: 'skull-star-eyes',
    name: 'Laughing Skull Star Eyes',
    category: 'music_misc',
    tags: ['skull', 'rock', 'stars', 'tattoo'],
    approxBox: { left: 30, top: 285, width: 220, height: 275 }
  },
  {
    file: 'media_1790156920149.png',
    id: 'vintage-1936',
    name: 'Vintage 1936 All Original Parts',
    category: 'retro',
    tags: ['badge', 'vintage', '1936', 'heritage'],
    approxBox: { left: 310, top: 290, width: 265, height: 270 }
  },
  {
    file: 'media_1790156920149.png',
    id: 'cheesecake-sign',
    name: 'Delicious Cheesecake Tin Sign',
    category: 'retro',
    tags: ['diner', 'sign', 'cheesecake', 'food'],
    approxBox: { left: 30, top: 575, width: 280, height: 395 }
  },
  {
    file: 'media_1790156920149.png',
    id: 'memories-license-plate',
    name: 'Memories Smile License Plate',
    category: 'retro',
    tags: ['licenseplate', 'memories', 'smile', 'car'],
    approxBox: { left: 325, top: 570, width: 225, height: 420 }
  }
];

module.exports = { STICKER_DEFINITIONS, userUploadDir, STICKERS_DIR };
