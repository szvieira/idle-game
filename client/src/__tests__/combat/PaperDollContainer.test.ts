import { describe, it, expect, vi } from 'vitest'

// Minimal Phaser mock — just enough to test PaperDollContainer logic
const mockImage = () => {
  const img: Record<string, ReturnType<typeof vi.fn>> = {}
  img.setVisible = vi.fn(() => img)
  img.setTexture = vi.fn(() => img)
  img.setPosition = vi.fn(() => img)
  img.setDepth = vi.fn(() => img)
  img.setFlipX = vi.fn(() => img)
  return img
}

const mockContainer = {
  add: vi.fn(),
  setPosition: vi.fn().mockReturnThis(),
  x: 0,
  y: 0,
}

const mockScene = {
  add: {
    image: vi.fn(() => mockImage()),
    container: vi.fn(() => mockContainer),
  },
  textures: {
    exists: vi.fn(() => true),
  },
}

vi.mock('phaser', () => ({
  default: {
    GameObjects: {
      Container: class {},
    },
  },
}))

describe('PaperDollContainer', () => {
  it('equip sets layer texture when overlay exists', async () => {
    const { PaperDollContainer } = await import('../../combat/PaperDollContainer')
    const doll = new PaperDollContainer(mockScene as never, 100, 200)
    doll.equip('Weapon', 'Iron Sword')
    const weaponLayer = doll.layers.get('Weapon') as unknown as ReturnType<typeof mockImage>
    expect(weaponLayer.setVisible).toHaveBeenCalledWith(true)
    expect(weaponLayer.setTexture).toHaveBeenCalledWith('overlay_Iron Sword')
  })

  it('unequip hides the layer', async () => {
    const { PaperDollContainer } = await import('../../combat/PaperDollContainer')
    const doll = new PaperDollContainer(mockScene as never, 100, 200)
    doll.equip('Weapon', 'Iron Sword')
    doll.unequip('Weapon')
    const weaponLayer = doll.layers.get('Weapon') as unknown as ReturnType<typeof mockImage>
    expect(weaponLayer.setVisible).toHaveBeenLastCalledWith(false)
  })

  it('equip Ring does nothing (no visual layer)', async () => {
    const { PaperDollContainer } = await import('../../combat/PaperDollContainer')
    const doll = new PaperDollContainer(mockScene as never, 100, 200)
    expect(() => doll.equip('Ring', 'Copper Ring')).not.toThrow()
  })
})
