import type { Template } from '@/types'
import { papitFilmStrip, papitFilmStrip3 } from './papitFilmStrip'

import {
  leopardHearts3,
  leopardBorder3,
  navratriGold3,
  fairyLights2,
  royalHeritage3,
} from './festiveKioskTemplates'

import {
  zebraStrip4,
  leopardSafari4,
  vintageLace3,
  pinkCow4,
  roseGarden2,
  burgundyRibbon3,
  holidayCherries3,
  fallenAngel4,
  crimsonKiss2,
} from './glamBatchTemplates'

import {
  cinemaTicket3,
  cinemaTicket1,
  photoTicket3,
  heartFrame3,
  heartFrame1,
} from './emoTicketTemplates'

import { BATCH_GENERATED_TEMPLATES } from './batchGeneratedTemplates'

const ALL_CUSTOM_RAW: Template[] = [
  ...BATCH_GENERATED_TEMPLATES,
  // Glam templates
  zebraStrip4,
  leopardSafari4,
  vintageLace3,
  pinkCow4,
  roseGarden2,
  burgundyRibbon3,
  holidayCherries3,
  fallenAngel4,
  crimsonKiss2,
  // Festive templates
  leopardHearts3,
  leopardBorder3,
  navratriGold3,
  fairyLights2,
  royalHeritage3,
  // Emo & Ticket templates
  cinemaTicket3,
  cinemaTicket1,
  photoTicket3,
  heartFrame3,
  heartFrame1,
  // PapIt strip
  papitFilmStrip3,
  papitFilmStrip,
]

// Ensure unique templates by id
export const CUSTOM_TEMPLATES: Template[] = ALL_CUSTOM_RAW.filter((t, index, self) =>
  index === self.findIndex(o => o.id === t.id)
)

export {
  leopardHearts3,
  leopardBorder3,
  navratriGold3,
  fairyLights2,
  royalHeritage3,
  zebraStrip4,
  leopardSafari4,
  vintageLace3,
  pinkCow4,
  roseGarden2,
  burgundyRibbon3,
  holidayCherries3,
  fallenAngel4,
  crimsonKiss2,
  cinemaTicket3,
  cinemaTicket1,
  photoTicket3,
  heartFrame3,
  heartFrame1,
}
