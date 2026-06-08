# Talent Graph Web — Design System

方向:**技术档案册 (Technical Registry)**。这套语言适用于全站所有数据密集页面
(总览、标签浏览器、实体层级、员工档案、关系图)。新页面照此实现,不要另起风格。

## 1. Visual Theme & Atmosphere

墨色 ink 落在近白冷调纸面上的技术登记册。信息密度高、克制、耐看。身份来自两处:
**数据原子用等宽 mono**(tag code / 实体 ID / 计数 / 日期),以及**承载语义的彩色 chip**
(list/assertion、confident/borderline、company/school)。装饰极少:发丝线分隔、极浅阴影、
单一深青点缀色只用于交互。不用卡片堆砌、不用渐变、不用粗色边。

## 2. Color Palette & Roles (OKLCH)

| Token | 值 | 角色 |
|---|---|---|
| `canvas` | `oklch(0.985 0.002 220)` | 页面底,近白微冷 |
| `surface` | `oklch(1 0 0)` | 面板/卡片底 |
| `sunken` | `oklch(0.976 0.003 220)` | 表头/次级填充 |
| `border` | `oklch(0.912 0.004 220)` | 发丝线分隔 |
| `border-strong` | `oklch(0.86 0.005 220)` | 强分隔 |
| `ink` | `oklch(0.24 0.012 255)` | 主文本 |
| `ink-2` | `oklch(0.48 0.011 255)` | 次文本 |
| `ink-3` | `oklch(0.60 0.008 255)` | 标签/弱文本 |
| `accent` | `oklch(0.52 0.10 200)` | 交互/链接/active(深青,唯一点缀) |
| `accent-strong` | `oklch(0.46 0.11 200)` | accent hover |
| `accent-tint` | `oklch(0.96 0.022 200)` | active 背景/hover wash |

语义色(chip = `*-tint` 底 + 同色相 `*` 文本,**绝不在彩底上用灰字**):

| 语义 | text | tint | 用处 |
|---|---|---|---|
| `list` | `oklch(0.45 0.12 255)` | `oklch(0.955 0.028 255)` | 名单标签 mode |
| `assertion` | `oklch(0.46 0.15 305)` | `oklch(0.955 0.035 305)` | 判定标签 mode |
| `confident` | `oklch(0.46 0.12 155)` | `oklch(0.955 0.04 155)` | 置信度 confident |
| `borderline` | `oklch(0.52 0.11 70)` | `oklch(0.955 0.06 80)` | 置信度 borderline |
| `company` | `oklch(0.55 0.08 270)` | — | 实体类型圆点 |
| `school` | `oklch(0.55 0.09 180)` | — | 实体类型圆点 |

## 3. Typography

- **Sans**: `Geist Variable`(自托管 @fontsource),CJK 回退 PingFang SC / Microsoft YaHei / Noto Sans SC。
- **Mono**: `Geist Mono Variable` — 所有数据原子(code/ID/数字/日期)走这个,带 `tabular-nums`。
- 选型理由:Geist 工程化、精准,不像 Inter 那样无个性;mono 同族保证数据原子声音一致。

| 级别 | size / weight / tracking |
|---|---|
| display(总览大数) | 30px / 600 / -0.022em / mono |
| h1 页标题 | 20px / 600 / -0.012em |
| h2 面板标题 | 14px / 600 / normal |
| body | 14px / 400 |
| label 微标题 | 12px / 500 / +0.04em / uppercase / ink-3 |

## 4. Components

- **Chip**(语义徽章):`*-tint` 底 + `*` 文本,`rounded-sm`(4px),`px-2 py-0.5`,12px/500,mono 仅当内容是 code。状态无 hover(纯标识)。
- **数据原子**:tag code / 实体 ID / 计数 → `font-mono tabular-nums`,ink 或 ink-2。
- **Panel**:`surface` 底 + `border` 发丝线 + `rounded-lg`(12px),无阴影或极浅 `0 1px 2px / 0.04`。标题用 label 级。
- **Ruled list/table**:行间 `border` 发丝线分隔(非斑马纹);数字列右对齐 tabular-nums,文本列左对齐;hover 行 `accent-tint` wash。
- **Nav item**:默认 ink-2,hover `sunken` 底,active `ink` 底白字 或 `accent-tint` 底 `accent` 字(全站择一,这里用 accent-tint+accent)。`active:scale-[0.98]`。
- **Button**:primary = `ink` 底白字 `rounded-sm`;`active:scale-[0.97]`;focus-visible ring accent。

## 5. Layout

- App shell:顶栏(56px,`surface` 底 + 底 border)+ 主工作区 `max-w-6xl px-6 py-8`。
- 间距尺度:4 / 8 / 12 / 16 / 24 / 32。列间距 ≥16px,密度高于营销页。
- 不用 5 张等同阴影卡片并排(命中 AI slop);总览状态用**发丝线分隔的 registry 条**,不是卡片网格。

## 6. Depth & Elevation

光感几乎全靠 border + 背景层级(canvas < sunken < surface),不堆阴影。仅浮起元素
(下拉、弹层)用 `0 4px 12px / 0.08`。相邻面用 border 区分,不用白卡叠白底。

## 7. Do / Don't

- ✅ 数据原子一律 mono + tabular-nums;✅ 语义靠 chip 颜色;✅ 发丝线分隔;✅ 单一 accent 只给交互。
- ❌ 不用渐变/glassmorphism/粗色边;❌ 不在彩底用灰字;❌ 不用等同阴影卡片网格;❌ 不引第二个点缀色;❌ 不用 Title Case 英文标题(用 sentence case)。

## 8. Responsive

- 断点 sm 640 / lg 1024。顶栏 nav 在 <640 收为简版;stat 条单列堆叠。
- 触控目标 ≥40×40;hover 态包 `@media(hover:hover)`。

## 9. Radius / Motion

- Radius 名义尺度:`sm 4px`(chip/button)· `md 8px`(input)· `lg 12px`(panel)。
- Motion:仅 transform/opacity;ease-out `cubic-bezier(0.16,1,0.3,1)`;press `scale(0.97-0.98)`;
  入场 stagger opacity+translateY(12px) ~80ms;一律 `prefers-reduced-motion` 关闭。
