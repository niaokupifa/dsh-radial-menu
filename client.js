/**
 * Browser half of the radial menu plugin.
 *
 * A single overlay entry in `shell.overlay` owns the ring: it captures
 * `contextmenu` while the pointer is over the conversation (capture phase, so the
 * app's own menus never open there; the navigation column, the right panel and the
 * window chrome keep their normal right-click behaviour),
 * draws the enabled items as SVG sectors around the pointer and runs one host
 * action per item. Nothing is re-implemented here — every action opens a surface
 * the app already ships through `ctx.sidebarRight` / `ctx.layout` — and the
 * settings section in `settings.section` edits the same stored config the ring
 * reads.
 */
window.__ModuleLoader__.load({
  id: 'dsh-radial-menu',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /** Locale namespace for every visible string in this plugin. */
    const NS = 'radial-menu'
    /** Where the layout choice is remembered; the settings section edits the same value. */
    const STORAGE_KEY = 'dsh-radial-menu.config.v1'
    /** The item ids the ring can draw, in catalogue order. */
    const ITEM_IDS = ['files', 'browser', 'review', 'terminal', 'sidebar']
    /** Default layout: the five entries of the Qoder ring. */
    const DEFAULT_CONFIG = { trigger: 'context', size: 'medium', items: ITEM_IDS.slice() }
    /**
     * The app marks the conversation body with this attribute. The ring accepts gestures only
     * inside it, so the workspace column, the right panel and the window chrome keep their own
     * right-click behaviour.
     */
    const CONVERSATION_REGION = '[data-conversation-region]'

    /** Chinese copy. Keys are flat and dotted, the same shape the app's own dictionaries use. */
    const zh = {
      'menu.title': '菜单',
      'menu.hint': '选择一个操作',
      'menu.close': '关闭菜单',
      'item.files': '工作区文件',
      'item.browser': '内置浏览器',
      'item.review': '审阅',
      'item.terminal': '终端',
      'item.sidebar': '侧边任务',
      'toast.noSession': '先在会话里打开一个项目，再试用这个菜单',
      'toast.noReview': '本轮还没有可审阅的改动：让 Agent 修改文件后，从会话末尾的改动卡片打开审阅',
      'toast.failed': '操作失败：{message}',
      'settings.nav': '环形菜单',
      'settings.title': '环形右键菜单',
      'settings.description': '在会话区域按下右键，光标周围出现一圈快捷入口；侧边栏与右侧面板保留原来的右键行为。每一项都打开应用已有的面板，不会另建一份界面。',
      'settings.trigger': '触发方式',
      'settings.trigger.context': '右键',
      'settings.trigger.alt': 'Alt + 右键',
      'settings.trigger.ctrl': 'Ctrl + 右键',
      'settings.trigger.off': '关闭',
      'settings.size': '圆环大小',
      'settings.size.small': '小',
      'settings.size.medium': '中',
      'settings.size.large': '大',
      'settings.items': '显示哪些菜单项',
      'settings.items.hint': '勾选要显示的项，并用上移 / 下移调整它们在圆环上的顺序。',
      'settings.moveUp': '上移 {name}',
      'settings.moveDown': '下移 {name}',
      'settings.reset': '恢复默认',
      'settings.note': '按住 Shift 再点右键始终使用系统菜单；在输入框或已选中文字上右键也保留系统菜单。工作区文件、内置浏览器已经是当前显示的那一页时，再按一次会把它关掉。',
    }

    /** English copy, same key set. */
    const en = {
      'menu.title': 'Menu',
      'menu.hint': 'Pick an action',
      'menu.close': 'Close menu',
      'item.files': 'Workspace files',
      'item.browser': 'Browser',
      'item.review': 'Review',
      'item.terminal': 'Terminal',
      'item.sidebar': 'Tasks',
      'toast.noSession': 'Open a session first, then try this menu',
      'toast.noReview': 'Nothing to review in this turn yet: let the agent edit files, then open Review from the changed-files card',
      'toast.failed': 'Action failed: {message}',
      'settings.nav': 'Radial menu',
      'settings.title': 'Radial context menu',
      'settings.description': 'Right-click over the conversation to get the entries in a ring around the pointer; the sidebar and the right panel keep their normal right-click behaviour. Each one opens a panel the app already ships.',
      'settings.trigger': 'Trigger',
      'settings.trigger.context': 'Right-click',
      'settings.trigger.alt': 'Alt + right-click',
      'settings.trigger.ctrl': 'Ctrl + right-click',
      'settings.trigger.off': 'Off',
      'settings.size': 'Ring size',
      'settings.size.small': 'Small',
      'settings.size.medium': 'Medium',
      'settings.size.large': 'Large',
      'settings.items': 'Menu items',
      'settings.items.hint': 'Tick the entries to show, then move them with the arrows to set their order on the ring.',
      'settings.moveUp': 'Move {name} up',
      'settings.moveDown': 'Move {name} down',
      'settings.reset': 'Reset to defaults',
      'settings.note': 'Shift + right-click always shows the system menu; right-clicking an input or selected text does too. When Workspace files or Built-in browser is already the page on screen, the same entry closes it.',
    }

    /* ---------------------------------------------------------------- config */

    /** Read the stored layout; anything unreadable falls back to the defaults. */
    function readStored() {
      try {
        const raw = globalThis.localStorage?.getItem?.(STORAGE_KEY)
        if (raw === null || raw === undefined || raw === '') return null
        return JSON.parse(raw)
      } catch {
        return null
      }
    }

    /** Coerce any stored/half-written value into a usable layout. */
    function normalize(value) {
      const source = value !== null && typeof value === 'object' ? value : {}
      const trigger = ['context', 'alt', 'ctrl', 'off'].includes(source.trigger) ? source.trigger : 'context'
      const size = ['small', 'medium', 'large'].includes(source.size) ? source.size : 'medium'
      const items = []
      const asked = Array.isArray(source.items) ? source.items : DEFAULT_CONFIG.items
      for (const id of asked) {
        if (ITEM_IDS.includes(id) && !items.includes(id)) items.push(id)
      }
      return { trigger, size, items: items.length > 0 ? items : DEFAULT_CONFIG.items.slice() }
    }

    let currentConfig = normalize(readStored())
    const configListeners = new Set()

    /** The layout the ring and the settings page both read. */
    function getConfig() {
      return currentConfig
    }

    /** Persist a new layout and wake every reader. */
    function setConfig(next) {
      currentConfig = normalize(next)
      try {
        globalThis.localStorage?.setItem?.(STORAGE_KEY, JSON.stringify(currentConfig))
      } catch {
        /* The ring still works for this session without storage. */
      }
      for (const listener of [...configListeners]) {
        try {
          listener()
        } catch {
          /* One bad reader must not break the others. */
        }
      }
    }

    /** Subscribe to layout changes. */
    function subscribeConfig(listener) {
      configListeners.add(listener)
      return () => {
        configListeners.delete(listener)
      }
    }

    /** Subscribe a component to the layout store. */
    function useConfig() {
      const [value, setValue] = React.useState(getConfig)
      React.useEffect(() => subscribeConfig(() => setValue(getConfig())), [])
      return value
    }

    /* -------------------------------------------------------------- geometry */

    /** One point on a circle, degrees measured like SVG angles (0 = three o'clock). */
    function pointOn(radius, degrees) {
      const radians = (degrees * Math.PI) / 180
      return [radius * Math.cos(radians), radius * Math.sin(radians)]
    }

    /** An annular sector path centred on the origin. */
    function sectorPath(inner, outer, from, to) {
      const [x0, y0] = pointOn(outer, from)
      const [x1, y1] = pointOn(outer, to)
      const [x2, y2] = pointOn(inner, to)
      const [x3, y3] = pointOn(inner, from)
      const large = to - from > 180 ? 1 : 0
      return `M ${x0} ${y0} A ${outer} ${outer} 0 ${large} 1 ${x1} ${y1} L ${x2} ${y2} A ${inner} ${inner} 0 ${large} 0 ${x3} ${y3} Z`
    }

    /** Keep a value inside a range. */
    function clamp(value, low, high) {
      return Math.min(Math.max(value, low), high)
    }

    /* ----------------------------------------------------------------- icons */

    /** The glyph of one item, drawn on a 24×24 grid around the current point. */
    function Glyph({ name, size }) {
      const scale = size / 24
      const path = (d, extra) =>
        h(
          'path',
          Object.assign(
            { d, fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' },
            extra,
          ),
        )
      const shapes = []
      if (name === 'files') {
        shapes.push(path('M3 7.5A2.5 2.5 0 0 1 5.5 5h3l2 2.5h8A2.5 2.5 0 0 1 21 10v7a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17V7.5Z'))
      } else if (name === 'browser') {
        shapes.push(h('circle', { cx: 12, cy: 12, r: 8.5, fill: 'none', stroke: 'currentColor', strokeWidth: 1.7 }))
        shapes.push(h('ellipse', { cx: 12, cy: 12, rx: 4, ry: 8.5, fill: 'none', stroke: 'currentColor', strokeWidth: 1.7 }))
        shapes.push(path('M3.7 12h16.6'))
      } else if (name === 'review') {
        shapes.push(path('M12 3.5v17'))
        shapes.push(path('M5.5 8.5h4M7.5 6.5v4'))
        shapes.push(path('M14.5 15.5h4'))
      } else if (name === 'terminal') {
        shapes.push(path('M3.5 5.5h17v13h-17z'))
        shapes.push(path('M7 10l3 2.5-3 2.5M13 15h4'))
      } else if (name === 'sidebar') {
        shapes.push(path('M3.5 5.5h17v13h-17z'))
        shapes.push(path('M9 5.5v13'))
      } else {
        shapes.push(h('circle', { cx: 12, cy: 12, r: 8, fill: 'none', stroke: 'currentColor', strokeWidth: 1.7 }))
      }
      return h('g', { transform: `translate(${-size / 2} ${-size / 2}) scale(${scale})`, style: { pointerEvents: 'none' } }, shapes)
    }

    /* ------------------------------------------------------------------ ring */

    /** Decide whether this gesture belongs to the ring rather than the app. */
    function acceptsEvent(event, trigger) {
      if (trigger === 'off') return false
      if (trigger === 'alt' && !event.altKey) return false
      if (trigger === 'ctrl' && !(event.ctrlKey || event.metaKey)) return false
      // Shift is the user's escape hatch back to the app's own menu.
      if (event.shiftKey) return false
      const target = event.target
      if (!(target instanceof Element)) return false
      if (target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]') !== null) return false
      const selection = globalThis.getSelection?.()
      if (selection !== null && selection !== undefined && selection.isCollapsed === false && String(selection).trim() !== '') {
        return false
      }
      // The ring belongs to the conversation surface only: the workspace column, the right
      // panel and the window chrome keep their own right-click behaviour. The fallback keeps
      // the menu usable on a shell that does not mark the conversation body.
      if (target.closest(CONVERSATION_REGION) === null && target.ownerDocument.querySelector(CONVERSATION_REGION) !== null) {
        return false
      }
      return true
    }

    /** The overlay: the ring itself plus the little message pill under it. */
    function RadialMenu(props) {
      const t = props.t
      const config = useConfig()
      const [position, setPosition] = React.useState(null)
      const [hover, setHover] = React.useState(-1)
      const [message, setMessage] = React.useState(null)
      const [entered, setEntered] = React.useState(false)
      const triggerRef = React.useRef(config.trigger)
      const timerRef = React.useRef(0)
      triggerRef.current = config.trigger

      const say = React.useCallback((text) => {
        setMessage(text)
        if (timerRef.current) globalThis.clearTimeout(timerRef.current)
        timerRef.current = globalThis.setTimeout(() => {
          setMessage(null)
          timerRef.current = 0
        }, 3600)
      }, [])

      React.useEffect(
        () => () => {
          if (timerRef.current) globalThis.clearTimeout(timerRef.current)
        },
        [],
      )

      const close = React.useCallback(() => {
        setPosition(null)
        setHover(-1)
      }, [])

      const open = position !== null && config.items.length > 0

      // One capture-phase listener owns the gesture; the dismiss listeners exist only while the ring is up,
      // so a closed menu costs the app a single `contextmenu` hook and no overlay DOM at all.
      React.useEffect(() => {
        function openAt(event) {
          if (!acceptsEvent(event, triggerRef.current)) return
          event.preventDefault()
          event.stopPropagation()
          setHover(-1)
          setPosition({ x: event.clientX, y: event.clientY })
        }
        function onKeyDown(event) {
          if (event.key === 'Escape') close()
        }
        function onPointerDown(event) {
          const target = event.target
          if (target instanceof Element && target.closest('[data-dsh-radial-menu]') !== null) return
          close()
        }
        function dismiss() {
          close()
        }
        globalThis.addEventListener('contextmenu', openAt, true)
        globalThis.addEventListener('keydown', onKeyDown, true)
        if (!open) {
          return () => {
            globalThis.removeEventListener('contextmenu', openAt, true)
            globalThis.removeEventListener('keydown', onKeyDown, true)
          }
        }
        globalThis.addEventListener('pointerdown', onPointerDown, true)
        globalThis.addEventListener('scroll', dismiss, true)
        globalThis.addEventListener('resize', dismiss, true)
        globalThis.addEventListener('blur', dismiss, true)
        return () => {
          globalThis.removeEventListener('contextmenu', openAt, true)
          globalThis.removeEventListener('keydown', onKeyDown, true)
          globalThis.removeEventListener('pointerdown', onPointerDown, true)
          globalThis.removeEventListener('scroll', dismiss, true)
          globalThis.removeEventListener('resize', dismiss, true)
          globalThis.removeEventListener('blur', dismiss, true)
        }
      }, [close, open])

      React.useEffect(() => {
        if (!open) {
          setEntered(false)
          return undefined
        }
        const frame = globalThis.requestAnimationFrame(() => setEntered(true))
        return () => globalThis.cancelAnimationFrame(frame)
      }, [open, position])

      const radius = config.size === 'small' ? 84 : config.size === 'large' ? 140 : 110
      const count = Math.max(config.items.length, 1)
      const step = 360 / count
      const gap = count >= 5 ? 4 : 6
      const view = radius * 2
      const mx = open ? clamp(position.x, radius + 12, Math.max(radius + 12, globalThis.innerWidth - radius - 12)) : 0
      const my = open ? clamp(position.y, radius + 12, Math.max(radius + 12, globalThis.innerHeight - radius - 12)) : 0
      // The caption hangs under the ring; near the bottom edge it flips above instead of leaving the window.
      const captionWidth = open ? Math.min(260, globalThis.innerWidth - 24) : 0
      const captionLeft = open ? clamp(mx, captionWidth / 2 + 12, globalThis.innerWidth - captionWidth / 2 - 12) : 0
      const captionTop = !open
        ? 0
        : my + radius + 14 + 38 > globalThis.innerHeight - 10
          ? my - radius - 14 - 38
          : my + radius + 14

      const sectors = []
      if (open) {
        config.items.forEach((id, index) => {
          const middle = -90 + step * index
          const half = step / 2 - gap / 2
          const active = hover === index
          const [ix, iy] = pointOn(radius * 0.6, middle)
          sectors.push(
            h(
              'g',
              {
                key: id,
                style: { cursor: 'pointer' },
                onMouseEnter: () => setHover(index),
                onClick: () => {
                  const problem = props.perform(id)
                  if (typeof problem === 'string' && problem !== '') say(problem)
                  close()
                },
              },
              h('path', {
                d: sectorPath(radius * 0.36, radius * 0.92, middle - half, middle + half),
                fill: active ? 'var(--dsw-alias-brand-primary, #4d6bfe)' : 'var(--dsw-alias-bg-elevated, #ffffff)',
                fillOpacity: active ? 0.14 : 0.97,
                stroke: active ? 'var(--dsw-alias-brand-primary, #4d6bfe)' : 'var(--dsw-alias-border-l1, rgba(0,0,0,.12))',
                strokeWidth: 1,
              }),
              h(
                'g',
                {
                  transform: `translate(${ix} ${iy})`,
                  style: { color: active ? 'var(--dsw-alias-brand-primary, #4d6bfe)' : 'var(--dsw-alias-label-primary, #1f2329)' },
                },
                h(Glyph, { name: id, size: radius * 0.22 }),
              ),
            ),
          )
        })
      }

      if (!open && message === null) return null

      return h(
        'div',
        {
          'data-dsh-radial-menu': 'layer',
          style: {
            position: 'fixed',
            inset: 0,
            zIndex: 2147483000,
            pointerEvents: 'none',
            font: 'inherit',
            color: 'var(--dsw-alias-label-primary, #1f2329)',
          },
        },
        open
          ? h(
              'div',
              {
                'data-dsh-radial-menu': 'ring',
                style: {
                  position: 'absolute',
                  left: mx,
                  top: my,
                  width: view,
                  height: view,
                  marginLeft: -radius,
                  marginTop: -radius,
                  pointerEvents: 'auto',
                  opacity: entered ? 1 : 0,
                  transition: 'opacity 90ms linear',
                },
              },
              h(
                'svg',
                { width: view, height: view, viewBox: `0 0 ${view} ${view}`, style: { display: 'block', overflow: 'visible' } },
                h(
                  'g',
                  { transform: `translate(${radius} ${radius})` },
                  // A slightly darker plate under the sectors: it reads as a disk, and the seams between
                  // sectors show it instead of the page behind the menu.
                  h('circle', { r: radius * 0.975, fill: 'rgba(15, 20, 32, 0.05)' }),
                  h('circle', { r: radius * 0.945, fill: 'rgba(15, 20, 32, 0.11)' }),
                  sectors,
                ),
                h(
                  'g',
                  {
                    style: { cursor: 'pointer' },
                    onClick: close,
                    transform: `translate(${radius} ${radius})`,
                    role: 'button',
                    'aria-label': t('menu.close'),
                  },
                  h('circle', {
                    r: radius * 0.27,
                    fill: 'var(--dsw-alias-bg-elevated, #ffffff)',
                    fillOpacity: 0.98,
                    stroke: 'var(--dsw-alias-border-l1, rgba(0,0,0,.12))',
                  }),
                  h('circle', { r: 3.2, fill: 'var(--dsw-alias-brand-primary, #4d6bfe)' }),
                ),
              ),
            )
          : null,
        open
          ? h(
              'div',
              {
                'data-dsh-radial-menu': 'caption',
                style: {
                  position: 'fixed',
                  left: captionLeft,
                  top: captionTop,
                  transform: 'translateX(-50%)',
                  maxWidth: captionWidth,
                  padding: '7px 16px',
                  borderRadius: 999,
                  background: 'var(--dsw-alias-bg-layer-2, #2b2f36)',
                  color: 'var(--dsw-alias-label-primary, #ffffff)',
                  border: '1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.10))',
                  boxShadow: '0 8px 22px rgba(15, 20, 32, .24)',
                  fontSize: 12.5,
                  fontWeight: 500,
                  lineHeight: 1.4,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  pointerEvents: 'none',
                  opacity: entered ? 1 : 0,
                  transition: 'opacity 90ms linear',
                },
              },
              hover >= 0 && hover < config.items.length ? t('item.' + config.items[hover]) : t('menu.hint'),
            )
          : null,
        message === null
          ? null
          : h(
              'div',
              {
                'data-dsh-radial-menu': 'message',
                style: {
                  position: 'fixed',
                  left: '50%',
                  bottom: 28,
                  transform: 'translateX(-50%)',
                  maxWidth: 420,
                  padding: '9px 14px',
                  borderRadius: 10,
                  background: 'var(--dsw-alias-bg-layer-2, #2b2f36)',
                  color: 'var(--dsw-alias-label-primary, #ffffff)',
                  border: '1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.12))',
                  boxShadow: '0 10px 30px rgba(0,0,0,.28)',
                  fontSize: 12.5,
                  lineHeight: 1.5,
                  pointerEvents: 'none',
                },
              },
              message,
            ),
      )
    }

    /* -------------------------------------------------------------- settings */

    /** One labelled row of the settings page. */
    function Row({ title, hint, children }) {
      return h(
        'div',
        { style: { display: 'flex', flexDirection: 'column', gap: 8, padding: '14px 0', borderBottom: '1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.08))' } },
        h(
          'div',
          { style: { display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' } },
          h('div', { style: { fontSize: 13, fontWeight: 600 } }, title),
          hint === undefined ? null : h('div', { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary, #646a73)' } }, hint),
        ),
        children,
      )
    }

    /** A segmented choice. */
    function Segmented({ options, value, onChange }) {
      return h(
        'div',
        { style: { display: 'flex', gap: 6, flexWrap: 'wrap' } },
        options.map(option =>
          h(
            'button',
            {
              key: option.value,
              type: 'button',
              onClick: () => onChange(option.value),
              style: {
                padding: '5px 12px',
                borderRadius: 8,
                fontSize: 12.5,
                cursor: 'pointer',
                border: `1px solid ${option.value === value ? 'var(--dsw-alias-brand-primary, #4d6bfe)' : 'var(--dsw-alias-border-l1, rgba(0,0,0,.12))'}`,
                background: option.value === value ? 'var(--dsw-alias-brand-primary, #4d6bfe)' : 'var(--dsw-alias-bg-layer-1, transparent)',
                color: option.value === value ? '#ffffff' : 'var(--dsw-alias-label-primary, inherit)',
                fontWeight: option.value === value ? 600 : 400,
              },
            },
            option.label,
          ),
        ),
      )
    }

    /** The settings page: trigger, size, and which items the ring draws in which order. */
    function SettingsSection(props) {
      const t = props.t
      const config = useConfig()

      const update = patch => setConfig({ ...config, ...patch })

      const toggle = id => {
        update({ items: config.items.includes(id) ? config.items.filter(item => item !== id) : [...config.items, id] })
      }

      const move = (index, delta) => {
        const next = config.items.slice()
        const target = index + delta
        if (target < 0 || target >= next.length) return
        const moved = next.splice(index, 1)[0]
        next.splice(target, 0, moved)
        update({ items: next })
      }

      const rows = ITEM_IDS.map(id => {
        const enabled = config.items.includes(id)
        const index = config.items.indexOf(id)
        const empty = { visibility: 'hidden', pointerEvents: 'none' }
        return h(
          'div',
          {
            key: id,
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 10px',
              borderRadius: 8,
              border: '1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.08))',
              background: enabled ? 'var(--dsw-alias-bg-layer-1, transparent)' : 'transparent',
            },
          },
          h('input', {
            type: 'checkbox',
            checked: enabled,
            onChange: () => toggle(id),
            style: { cursor: 'pointer', accentColor: 'var(--dsw-alias-brand-primary, #4d6bfe)' },
          }),
          h('div', { style: { flex: 1, fontSize: 13 } }, t('item.' + id)),
          h(
            'button',
            {
              type: 'button',
              title: t('settings.moveUp', { name: t('item.' + id) }),
              'aria-label': t('settings.moveUp', { name: t('item.' + id) }),
              disabled: !enabled || index <= 0,
              onClick: () => move(index, -1),
              style: Object.assign({ padding: '2px 8px', borderRadius: 6, cursor: 'pointer', border: '1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.12))', background: 'transparent', fontSize: 12 }, enabled && index > 0 ? {} : empty),
            },
            '↑',
          ),
          h(
            'button',
            {
              type: 'button',
              title: t('settings.moveDown', { name: t('item.' + id) }),
              'aria-label': t('settings.moveDown', { name: t('item.' + id) }),
              disabled: !enabled || index === config.items.length - 1,
              onClick: () => move(index, 1),
              style: Object.assign({ padding: '2px 8px', borderRadius: 6, cursor: 'pointer', border: '1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.12))', background: 'transparent', fontSize: 12 }, enabled && index !== config.items.length - 1 ? {} : empty),
            },
            '↓',
          ),
        )
      })

      return h(
        'div',
        { style: { display: 'flex', flexDirection: 'column', maxWidth: 620, color: 'var(--dsw-alias-label-primary, inherit)' } },
        h('div', { style: { fontSize: 15, fontWeight: 600 } }, t('settings.title')),
        h('div', { style: { marginTop: 6, fontSize: 12.5, lineHeight: 1.6, color: 'var(--dsw-alias-label-secondary, #646a73)' } }, t('settings.description')),
        h(
          Row,
          {
            title: t('settings.trigger'),
          },
          h(Segmented, {
            value: config.trigger,
            onChange: value => update({ trigger: value }),
            options: ['context', 'alt', 'ctrl', 'off'].map(value => ({ value, label: t('settings.trigger.' + value) })),
          }),
        ),
        h(
          Row,
          { title: t('settings.size') },
          h(Segmented, {
            value: config.size,
            onChange: value => update({ size: value }),
            options: ['small', 'medium', 'large'].map(value => ({ value, label: t('settings.size.' + value) })),
          }),
        ),
        h(
          Row,
          { title: t('settings.items'), hint: t('settings.items.hint') },
          h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } }, rows),
        ),
        h('div', { style: { marginTop: 12, fontSize: 12.5, lineHeight: 1.6, color: 'var(--dsw-alias-label-secondary, #646a73)' } }, t('settings.note')),
        h(
          'div',
          { style: { marginTop: 14 } },
          h(
            'button',
            {
              type: 'button',
              onClick: () => setConfig(DEFAULT_CONFIG),
              style: {
                padding: '6px 14px',
                borderRadius: 8,
                fontSize: 12.5,
                cursor: 'pointer',
                border: '1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.12))',
                background: 'transparent',
                color: 'var(--dsw-alias-label-primary, inherit)',
              },
            },
            t('settings.reset'),
          ),
        ),
      )
    }

    /* ------------------------------------------------------------------ plugin */

    return {
      inject: ['slots', 'locale', 'sidebarRight', 'layout'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-radial-menu: dictionaries')
        const t = ctx.locale.bind(NS)

        /** Ask the app for the review of the current session, if it already has one open. */
        function openReview() {
          const session = ctx.sidebarRight.mounted.getSnapshot()
          if (session === undefined) return t('toast.noSession')
          const tabs = typeof ctx.sidebarRight.tabsIn === 'function' ? ctx.sidebarRight.tabsIn(session) : []
          const review = tabs.find(tab => tab !== undefined && tab.kind === 'changes-review')
          if (review !== undefined) {
            ctx.sidebarRight.focus(review.id)
            return null
          }
          return t('toast.noReview')
        }

        /** Open one of the app's single-instance pages, or close it when it is already the page on screen. */
        function showOrClose(kind) {
          if (ctx.sidebarRight.isExpanded() === true) {
            const active = ctx.sidebarRight.active()
            if (active !== undefined && active.kind === kind) {
              ctx.sidebarRight.close(active.id)
              return null
            }
          }
          ctx.sidebarRight.openTab(kind)
          return null
        }

        /** Run one ring item; returns a message to show, or null when it just opened a surface. */
        function perform(id) {
          try {
            if (id === 'files') return showOrClose('files')
            if (id === 'browser') return showOrClose('browser')
            if (id === 'terminal') {
              ctx.sidebarRight.openTab('terminal')
              return null
            }
            if (id === 'sidebar') {
              ctx.layout.toggleSidebar()
              return null
            }
            if (id === 'review') return openReview()
            return null
          } catch (error) {
            const detail = error !== null && error !== undefined && typeof error.message === 'string' ? error.message : String(error)
            return t('toast.failed', { message: detail })
          }
        }

        ctx.slots.inject('shell.overlay', () =>
          ctx.slots.register(
            {
              name: 'shell.overlay',
              id: 'dsh-radial-menu.ring',
              inject: () => ({ t, perform }),
            },
            RadialMenu,
          ),
        )

        ctx.slots.inject('settings.section', () =>
          ctx.slots.register(
            {
              name: 'settings.section',
              id: 'radial-menu',
              order: 25,
              locale: NS,
              label: () => t('settings.nav'),
              inject: () => ({ t }),
            },
            SettingsSection,
          ),
        )
      },
    }
  },
})
