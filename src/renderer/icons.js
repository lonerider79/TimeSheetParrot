// Heroicons are imported as image URLs. This keeps the UI free from inline SVG markup.
import squares2x2 from 'heroicons/24/outline/squares-2x2.svg?url'
import clock from 'heroicons/24/outline/clock.svg?url'
import cog6 from 'heroicons/24/outline/cog-6-tooth.svg?url'
import information from 'heroicons/24/outline/information-circle.svg?url'
import sun from 'heroicons/24/outline/sun.svg?url'
import moon from 'heroicons/24/outline/moon.svg?url'
import plus from 'heroicons/24/outline/plus.svg?url'
import play from 'heroicons/24/outline/play.svg?url'
import stop from 'heroicons/24/outline/stop.svg?url'
import minus from 'heroicons/24/outline/minus.svg?url'
import xMark from 'heroicons/24/outline/x-mark.svg?url'
import chevronLeft from 'heroicons/24/outline/chevron-left.svg?url'
import chevronRight from 'heroicons/24/outline/chevron-right.svg?url'
import arrowDown from 'heroicons/24/outline/arrow-down-tray.svg?url'
import arrowPath from 'heroicons/24/outline/arrow-path.svg?url'
import pencil from 'heroicons/24/outline/pencil.svg?url'
import trash from 'heroicons/24/outline/trash.svg?url'
import check from 'heroicons/24/outline/check.svg?url'
import folder from 'heroicons/24/outline/folder.svg?url'
import briefcase from 'heroicons/24/outline/briefcase.svg?url'
import currency from 'heroicons/24/outline/currency-dollar.svg?url'
import language from 'heroicons/24/outline/language.svg?url'
import archive from 'heroicons/24/outline/archive-box.svg?url'
import documentArrowUp from 'heroicons/24/outline/document-arrow-up.svg?url'
import windowIcon from 'heroicons/24/outline/rectangle-group.svg?url'

const icons = {
  'squares-2x2': squares2x2,
  clock,
  'cog-6-tooth': cog6,
  'information-circle': information,
  sun,
  moon,
  plus,
  play,
  stop,
  minus,
  'x-mark': xMark,
  'chevron-left': chevronLeft,
  'chevron-right': chevronRight,
  'arrow-down-tray': arrowDown,
  'arrow-path': arrowPath,
  pencil,
  trash,
  check,
  folder,
  briefcase,
  'currency-dollar': currency,
  language,
  'archive-box': archive,
  'document-arrow-up': documentArrowUp,
  window: windowIcon,
}

export function icon(name, className = 'w-5 h-5') {
  const source = icons[name]

  if (!source) {
    return ''
  }

  return `<img src="${source}" class="icon-image ${className}" alt="" aria-hidden="true" />`
}

export function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach(element => {
    const name = element.dataset.icon
    const className = element.dataset.iconClass || 'w-5 h-5'

    element.innerHTML = icon(name, className)
  })
}
