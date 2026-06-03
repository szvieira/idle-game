package main

import (
	"bufio"
	"fmt"
	"math/rand"
	"os"
	"strings"
	"time"

	"game/internal/character"
	"game/internal/combat"
	"game/internal/dungeon"
)

// ── ANSI ──────────────────────────────────────────────────────────────────────

const (
	reset   = "\033[0m"
	bold    = "\033[1m"
	red     = "\033[31m"
	green   = "\033[32m"
	yellow  = "\033[33m"
	magenta = "\033[35m"
	cyan    = "\033[36m"
)

// ── Timing ────────────────────────────────────────────────────────────────────

const (
	delayAction    = 700 * time.Millisecond
	delayDeath     = 1200 * time.Millisecond
	delayBossDeath = 1500 * time.Millisecond
	delayEpicLoot  = 2000 * time.Millisecond
	delayLevelUp   = 1500 * time.Millisecond
	delayRoomClear = 1200 * time.Millisecond
)

// ── Display helpers ───────────────────────────────────────────────────────────

func hpBar(current, maxHP int) string {
	const w = 12
	if current < 0 {
		current = 0
	}
	filled := current * w / maxHP
	if filled > w {
		filled = w
	}
	bar := strings.Repeat("█", filled) + strings.Repeat("░", w-filled)
	pct := float64(current) / float64(maxHP)
	col := green
	switch {
	case pct <= 0.25:
		col = red
	case pct <= 0.5:
		col = yellow
	}
	return fmt.Sprintf("%s[%s]%s %d/%d", col, bar, reset, current, maxHP)
}

func clearScreen() { fmt.Print("\033[H\033[2J") }
func wait(d time.Duration) { time.Sleep(d) }

func fmtDuration(d time.Duration) string {
	s := int(d.Seconds())
	if s < 60 {
		return fmt.Sprintf("%ds", s)
	}
	return fmt.Sprintf("%dm %ds", s/60, s%60)
}

func rarityColor(r string) string {
	if r == "Epic" {
		return magenta
	}
	return yellow
}

func hline(w int) string { return strings.Repeat("─", w) }
func dline(w int) string { return strings.Repeat("═", w) }

// ── Terminal combat handler ───────────────────────────────────────────────────

type terminalHandler struct{}

func (terminalHandler) OnEnemyIntro(name string, hp, maxHP int, isBoss bool) {
	if isBoss {
		banner := fmt.Sprintf("=== %s ===", strings.ToUpper(name))
		w := max(len(banner)+6, 44)
		inner := fmt.Sprintf("  %s  ", banner)
		fmt.Printf("\n\n  %s%s╔%s╗%s\n", bold, magenta, dline(w), reset)
		fmt.Printf("  %s%s║%-*s║%s\n", bold, magenta, w, inner, reset)
		fmt.Printf("  %s%s╚%s╝%s\n\n", bold, magenta, dline(w), reset)
		wait(delayAction)
	} else {
		fmt.Printf("\n  %s──  %s%s%s\n", cyan, red, name, reset)
		fmt.Printf("     Enemy HP: %s\n\n", hpBar(hp, maxHP))
	}
}

func (terminalHandler) OnPlayerAttack(damage int, isCrit, isSpecial bool, specialName, targetName string, enemyHP, enemyMaxHP, playerHP, playerMaxHP int) {
	wait(delayAction)
	if isCrit {
		fmt.Printf("  %s%s!!! CRITICAL HIT !!!%s\n", bold, magenta, reset)
		wait(200 * time.Millisecond)
	}
	if isSpecial {
		fmt.Printf("  %s%s> > > %s!%s\n", bold, yellow, specialName, reset)
	} else {
		fmt.Printf("  > > > Attack\n")
	}
	fmt.Printf("  %s  ⚔  %d damage to %s%s\n", green, damage, targetName, reset)
	fmt.Printf("     Enemy HP: %s\n", hpBar(enemyHP, enemyMaxHP))
	fmt.Printf("     Your HP:  %s\n", hpBar(playerHP, playerMaxHP))
}

func (terminalHandler) OnPlayerHeal(amount int, specialName string, playerHP, playerMaxHP int) {
	wait(delayAction)
	fmt.Printf("  %s%s+++ %s%s\n", bold, green, specialName, reset)
	fmt.Printf("  %s  💚 +%d HP restored%s\n", green, amount, reset)
	fmt.Printf("     Your HP:  %s\n", hpBar(playerHP, playerMaxHP))
}

func (terminalHandler) OnEnemyAttack(damage int, isCrit bool, attackerName string, playerHP, playerMaxHP int) {
	fmt.Println()
	if isCrit {
		fmt.Printf("  %s%s!!! CRITICAL HIT !!!%s\n", bold, magenta, reset)
		wait(200 * time.Millisecond)
	}
	fmt.Printf("  %s🗡  %s attacks!%s\n", red, attackerName, reset)
	fmt.Printf("  %s  💢 %d damage received%s\n", red, damage, reset)
	fmt.Printf("     Your HP:  %s\n", hpBar(playerHP, playerMaxHP))
}

func (terminalHandler) OnEnemyDeath(name string, isBoss bool) {
	fmt.Println()
	fmt.Printf("  %s%s  ──────────────────────────────────────%s\n", bold, yellow, reset)
	fmt.Printf("  %s%s  💀 %s has been defeated!%s\n", bold, yellow, name, reset)
	fmt.Printf("  %s%s  ──────────────────────────────────────%s\n", bold, yellow, reset)
	d := delayDeath
	if isBoss {
		d = delayBossDeath
	}
	wait(d)
}

// ── Terminal level-up handler ─────────────────────────────────────────────────

type terminalLevelUpHandler struct{}

func (terminalLevelUpHandler) OnLevelUp(class string, newLevel, maxHP, hp, attack int) {
	const w = 46
	msg := fmt.Sprintf("  ✦  LEVEL UP!  %s reached Level %d  ✦", class, newLevel)
	fmt.Printf("\n%s%s╔%s╗%s\n", bold, yellow, dline(w), reset)
	fmt.Printf("%s%s║%-*s║%s\n", bold, yellow, w, msg, reset)
	fmt.Printf("%s%s╚%s╝%s\n", bold, yellow, dline(w), reset)
	fmt.Printf("  %s  +10 Max HP  |  +1 Attack%s\n", green, reset)
	fmt.Printf("  HP: %s\n", hpBar(hp, maxHP))
	wait(delayLevelUp)
}

// ── Class selection ───────────────────────────────────────────────────────────

func printBanner() {
	const w = 50
	fmt.Printf("\n%s%s╔%s╗%s\n", bold, cyan, dline(w), reset)
	fmt.Printf("%s%s║%-*s║%s\n", bold, cyan, w, "   DUNGEON: THE FORSAKEN CRYPT", reset)
	fmt.Printf("%s%s║%-*s║%s\n", bold, cyan, w, "   Idle Raid RPG — Terminal Prototype", reset)
	fmt.Printf("%s%s╚%s╝%s\n\n", bold, cyan, dline(w), reset)
}

func selectClass() *character.Character {
	reader := bufio.NewReader(os.Stdin)
	for {
		fmt.Println("Choose your class:")
		fmt.Printf("  %s[1] Warrior%s  HP:280  ATK:30  DEF:30%%  CRIT:5%%\n", bold, reset)
		fmt.Printf("         Special: Brutal Strike (2.2× dmg, CD:4)\n\n")
		fmt.Printf("  %s[2] Mage%s     HP:140  ATK:48  DEF:10%%  CRIT:15%%\n", bold, reset)
		fmt.Printf("         Special: Fireball (2.5× dmg, CD:3)\n\n")
		fmt.Printf("  %s[3] Priest%s   HP:200  ATK:18  DEF:20%%  CRIT:5%%\n", bold, reset)
		fmt.Printf("         Special: Heal (+55 HP, activates below 50%% HP, CD:2)\n\n")
		fmt.Print("> ")
		input, _ := reader.ReadString('\n')
		switch strings.TrimSpace(input) {
		case "1":
			return character.NewWarrior()
		case "2":
			return character.NewMage()
		case "3":
			return character.NewPriest()
		default:
			fmt.Print("\nInvalid choice. Enter 1, 2, or 3.\n\n")
		}
	}
}

// ── Room / dungeon screens ────────────────────────────────────────────────────

func printRoomScreen(r dungeon.Room, idx, total int, c *character.Character) {
	const w = 50
	hdr := fmt.Sprintf("  DUNGEON: THE FORSAKEN CRYPT   [%d / %d]", idx, total)
	fmt.Printf("%s%s╔%s╗%s\n", bold, cyan, dline(w), reset)
	fmt.Printf("%s%s║%-*s║%s\n", bold, cyan, w, hdr, reset)
	fmt.Printf("%s%s╚%s╝%s\n\n", bold, cyan, dline(w), reset)

	fmt.Printf("  %s%s%s\n", bold, r.Name, reset)
	names := make([]string, len(r.Enemies))
	for i, e := range r.Enemies {
		names[i] = e.Name
	}
	fmt.Printf("  Enemies: %s\n\n", strings.Join(names, ", "))
	fmt.Printf("  [%s]  Lv.%d  HP: %s  MP: %d/%d\n",
		c.Class, c.Level, hpBar(c.HP, c.MaxHP), c.Mana, c.MaxMana)
	fmt.Printf("  %s\n\n", hline(w))
}

func printRoomSummary(stats dungeon.RoomStats, item *dungeon.Item, roomIdx int) {
	title := fmt.Sprintf("  ROOM %d SUMMARY — %s", roomIdx, stats.Name)
	w := max(len(title), 46)
	fmt.Printf("\n%s%s┌%s┐%s\n", bold, cyan, hline(w), reset)
	fmt.Printf("%s%s│%-*s│%s\n", bold, cyan, w, title, reset)
	fmt.Printf("%s%s└%s┘%s\n\n", bold, cyan, hline(w), reset)

	fmt.Printf("  %-26s %d\n", "Enemies Defeated:", stats.Combat.EnemiesDefeated)
	fmt.Printf("  %-26s %s%d%s\n", "Damage Dealt:", green, stats.Combat.DamageDealt, reset)
	fmt.Printf("  %-26s %s%d%s\n", "Damage Taken:", red, stats.Combat.DamageTaken, reset)
	if stats.Combat.HealingReceived > 0 {
		fmt.Printf("  %-26s %s+%d%s\n", "Healing Received:", green, stats.Combat.HealingReceived, reset)
	} else {
		fmt.Printf("  %-26s —\n", "Healing Received:")
	}
	fmt.Printf("  %-26s %s+%d XP%s\n", "XP Gained:", yellow, stats.XPGained, reset)
	fmt.Printf("  %-26s %s+%d Gold%s\n", "Gold Earned:", yellow, stats.GoldEarned, reset)
	fmt.Printf("  %-26s %s\n", "Time:", fmtDuration(stats.Duration))

	if item != nil {
		col := rarityColor(item.Rarity)
		fmt.Printf("\n  %s⬦ Loot:%s  %-22s [%s%s%s]  %s\n",
			bold, reset, item.Name, col, item.Rarity, reset, item.Slot)
	}
	fmt.Println()
}

func printDungeonSummary(c *character.Character, ds *dungeon.DungeonStats) {
	enemies, dealt, taken, healing, xp, gold := ds.Totals()
	const w = 46

	fmt.Printf("\n%s%s╔%s╗%s\n", bold, green, dline(w), reset)
	fmt.Printf("%s%s║%-*s║%s\n", bold, green, w, "        DUNGEON COMPLETE!", reset)
	fmt.Printf("%s%s╚%s╝%s\n\n", bold, green, dline(w), reset)

	fmt.Printf("  Class:          %s%s%s  (Lv.%d)\n", bold, c.Class, reset, c.Level)
	fmt.Printf("  HP Remaining:   %s\n\n", hpBar(c.HP, c.MaxHP))

	fmt.Printf("  %s── COMBAT STATS ──%s\n", bold, reset)
	fmt.Printf("  %-28s %d\n", "Total Enemies Defeated:", enemies)
	fmt.Printf("  %-28s %s%d%s\n", "Total Damage Dealt:", green, dealt, reset)
	fmt.Printf("  %-28s %s%d%s\n", "Total Damage Taken:", red, taken, reset)
	if healing > 0 {
		fmt.Printf("  %-28s %s+%d%s\n", "Total Healing Received:", green, healing, reset)
	} else {
		fmt.Printf("  %-28s —\n", "Total Healing Received:")
	}

	fmt.Printf("\n  %s── REWARDS ──%s\n", bold, reset)
	fmt.Printf("  %-28s %s+%d XP%s\n", "Total XP:", yellow, xp, reset)
	fmt.Printf("  %-28s %s+%d Gold%s\n", "Total Gold:", yellow, gold, reset)

	if len(ds.Loot) > 0 {
		fmt.Printf("\n  %s── LOOT ACQUIRED ──%s\n", bold, reset)
		for _, it := range ds.Loot {
			col := rarityColor(it.Rarity)
			fmt.Printf("    ⬦ %-22s  [%s%s%s]  %s\n",
				it.Name, col, it.Rarity, reset, it.Slot)
		}
	}

	fmt.Printf("\n  %sDungeon Completed In: %s%s%s\n\n",
		bold, cyan, fmtDuration(ds.EndTime.Sub(ds.StartTime)), reset)
}

func printDefeat(c *character.Character, ds *dungeon.DungeonStats) {
	enemies, _, _, _, xp, gold := ds.Totals()
	const w = 46

	fmt.Printf("\n%s%s╔%s╗%s\n", bold, red, dline(w), reset)
	fmt.Printf("%s%s║%-*s║%s\n", bold, red, w, "           YOU HAVE FALLEN", reset)
	fmt.Printf("%s%s╚%s╝%s\n\n", bold, red, dline(w), reset)

	fmt.Printf("  %s%s%s was slain in The Forsaken Crypt.\n", bold, c.Class, reset)
	fmt.Printf("  Enemies slain: %d\n", enemies)
	if xp > 0 || gold > 0 {
		fmt.Printf("  Partial rewards — XP: +%d   Gold: +%d\n", xp, gold)
	} else {
		fmt.Println("  No rewards — dungeon incomplete.")
	}
	fmt.Println()
}

// ── Entry point ───────────────────────────────────────────────────────────────

func main() {
	rng := rand.New(rand.NewSource(time.Now().UnixNano()))
	h := terminalHandler{}
	lvlH := terminalLevelUpHandler{}

	printBanner()
	c := selectClass()

	fmt.Printf("\n%s%s entered The Forsaken Crypt%s  (Recommended Level: 10+)\n",
		bold, c.Class, reset)
	fmt.Printf("  Lv.%d  HP:%d  ATK:%d  DEF:%d%%  CRIT:%d%%  CDR:%d%%\n",
		c.Level, c.MaxHP, c.Attack, c.Defense, c.Critical, c.CDR)
	fmt.Printf("  Special: %s%s%s  (CD:%d ticks  Mana cost:%d)\n\n",
		yellow, c.SpecialName, reset, c.SpecialCD, c.SpecialManaCost)
	wait(time.Second)

	ds := &dungeon.DungeonStats{StartTime: time.Now()}
	rooms := dungeon.BuildDungeon()

	for i, r := range rooms {
		clearScreen()
		printRoomScreen(r, i+1, len(rooms), c)

		rs := dungeon.RoomStats{
			Name:       r.Name,
			XPGained:   r.XP,
			GoldEarned: r.Gold,
			StartTime:  time.Now(),
		}

		dead := false
		for _, e := range r.Enemies {
			if !combat.RunCombat(c, e, &rs.Combat, r.IsBoss, rng, h) {
				dead = true
				break
			}
		}

		rs.Duration = time.Since(rs.StartTime)

		if dead {
			ds.EndTime = time.Now()
			printDefeat(c, ds)
			return
		}

		c.XP += r.XP
		character.CheckLevelUp(c, lvlH)

		var dropped *dungeon.Item
		if item := dungeon.RollItem(rng, r.IsElite, r.IsBoss); item != nil {
			ds.Loot = append(ds.Loot, item)
			dropped = item
		}

		ds.Rooms = append(ds.Rooms, rs)
		printRoomSummary(rs, dropped, i+1)

		if dropped != nil && dropped.Rarity == "Epic" {
			wait(delayEpicLoot)
		} else {
			wait(delayRoomClear)
		}
	}

	ds.EndTime = time.Now()
	printDungeonSummary(c, ds)
}
