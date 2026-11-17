import Phaser from 'phaser';
import { SaveManager } from '../save.js';
import {
  BRANCHES,
  LOCKED_TEXT,
  NODE_TEXT,
  TECH_TREE_ASSET_ENTRIES,
} from '../data/tech.js';
import { ITEM_ICON_ENTRIES } from '../data/items.js';
import { audio } from '../core/audio.js';
import { bus } from '../core/events.js';
import { floatText, inventory } from '../core/inventory.js';
import { state } from '../core/state.js';
import { UI } from '../ui/theme.js';

const TECH_TREE_AUDIO_IDS = [
  'SFX_Workstation_On',
  'SFX_Menu_Open',
  'SFX_Menu_Close',
  'SFX_Tab_Switch',
  'SFX_Item_Select',
  'SFX_Not_Enough_Resources',
  'SFX_Research_Start',
  'SFX_Research_Loop',
  'SFX_Research_Complete',
  'SFX_Crafting_Start',
  'SFX_Crafting_Loop',
  'SFX_Crafting_Complete',
  'SFX_Objective_Updated',
  'SFX_Objective_Complete',
  'SFX_Score_Tick',
];

function lerpColor(c1, c2, t) {
  const r1 = (c1 >> 16) & 0xff;
  const g1 = (c1 >> 8) & 0xff;
  const b1 = c1 & 0xff;
  const r2 = (c2 >> 16) & 0xff;
  const g2 = (c2 >> 8) & 0xff;
  const b2 = c2 & 0xff;
  return (
    (Math.round(r1 + (r2 - r1) * t) << 16) |
    (Math.round(g1 + (g2 - g1) * t) << 8) |
    Math.round(b1 + (b2 - b1) * t)
  );
}

function drawNeonPanel(gfx, x, y, w, h) {
  gfx.clear();

  // Outer glow (alpha 0.45, color 0x2f7fd6)
  gfx.lineStyle(6, 0x2f7fd6, 0.2);
  gfx.strokeRoundedRect(x - 3, y - 3, w + 6, h + 6, 13);
  gfx.lineStyle(3, 0x2f7fd6, 0.45);
  gfx.strokeRoundedRect(x - 1.5, y - 1.5, w + 3, h + 3, 11);

  // Fill vertical gradient 0x0b1d45 -> 0x081230
  gfx.fillStyle(0x081230, 1);
  gfx.fillRoundedRect(x, y, w, h, 10);

  const bands = 10;
  const ix = x + 3;
  const iy = y + 3;
  const iw = Math.max(0, w - 6);
  const ih = Math.max(0, h - 6);

  for (let i = 0; i < bands; i += 1) {
    const col = lerpColor(0x0b1d45, 0x081230, i / (bands - 1));
    const by0 = iy + Math.round((i * ih) / bands);
    const by1 = iy + Math.round(((i + 1) * ih) / bands);
    const bh = by1 - by0;
    if (bh <= 0) continue;
    const inset = i === 0 || i === bands - 1 ? 3 : 0;
    gfx.fillStyle(col, 1);
    gfx.fillRect(ix + inset, by0, Math.max(0, iw - inset * 2), bh);
  }

  // Inner line 2 px 0x0a2a66
  gfx.lineStyle(2, 0x0a2a66, 1);
  gfx.strokeRoundedRect(x + 4, y + 4, Math.max(0, w - 8), Math.max(0, h - 8), 7);

  // Border 3 px 0x2f7fd6
  gfx.lineStyle(3, 0x2f7fd6, 1);
  gfx.strokeRoundedRect(x + 1.5, y + 1.5, Math.max(0, w - 3), Math.max(0, h - 3), 10);

  return gfx;
}

function drawGoldButton(gfx, x, y, w, h, enabled = true, hover = false) {
  gfx.clear();
  const topCol = hover && enabled ? 0xffe474 : 0xffd94d;
  const botCol = hover && enabled ? 0xffb338 : 0xf5a623;

  gfx.fillStyle(botCol, 1);
  gfx.fillRoundedRect(x, y, w, h, 10);

  const bands = 6;
  for (let i = 0; i < bands; i += 1) {
    const col = lerpColor(topCol, botCol, i / (bands - 1));
    const by0 = y + Math.round((i * h) / bands);
    const by1 = y + Math.round(((i + 1) * h) / bands);
    const inset = i === 0 || i === bands - 1 ? 3 : 0;
    gfx.fillStyle(col, 1);
    gfx.fillRect(x + inset, by0, w - inset * 2, by1 - by0);
  }

  gfx.lineStyle(3, 0xfff2b0, 1);
  gfx.strokeRoundedRect(x + 1.5, y + 1.5, w - 3, h - 3, 10);
  gfx.setAlpha(enabled ? 1 : 0.45);
}

export class TechTreeScene extends Phaser.Scene {
  constructor() {
    super('TechTreeScene');
  }

  init(data) {
    this.from = (data && data.from) || 'InteriorScene';
  }

  preload() {
    const assets = [...TECH_TREE_ASSET_ENTRIES, ...ITEM_ICON_ENTRIES];
    for (const [key, url] of assets) {
      if (!this.textures.exists(key)) {
        this.load.image(key, url);
      }
    }
    audio.preload(this, TECH_TREE_AUDIO_IDS);
  }

  create() {
    this._closing = false;
    this._busy = false;
    this._activeLoopId = null;
    this._progressTimer = null;
    this._pulseTweens = [];
    this._openedAt = performance.now();
    this._openedAtObj08 = state.objectiveIndex === 7;
    this._researchedDuringSession = false;
    this._craftedDuringSession = false;

    const linearKeys = [
      ...TECH_TREE_ASSET_ENTRIES.map(([k]) => k),
      ...ITEM_ICON_ENTRIES.map(([k]) => k),
    ];
    for (const k of linearKeys) {
      if (this.textures.exists(k)) {
        this.textures.get(k).setFilter(Phaser.Textures.FilterMode.LINEAR);
      }
    }

    this.cameras.main.setBounds(0, 0, 1280, 720);

    // Sounds on open
    audio.play('SFX_Workstation_On');
    audio.play('SFX_Menu_Open');

    // Check if next-research flags were already both viewed when opening at objective 10
    this._checkNextResearchReviewed();

    // Smart initial branch & node selection
    if (state.objectiveIndex <= 8) {
      this.selectedBranchIndex = 0;
      this.selectedNodeId = 'basic_material_processing';
    } else if (
      state.objectiveIndex === 9 &&
      !state.has('next_research_reviewed')
    ) {
      if (!state.flags.viewed_oxygen_recovery) {
        this.selectedBranchIndex = 1; // Life Support
        this.selectedNodeId = 'water_recycling';
      } else {
        this.selectedBranchIndex = 2; // Power
        this.selectedNodeId = 'solar_panel_efficiency';
      }
    } else {
      this.selectedBranchIndex = 0;
      this.selectedNodeId = 'basic_mining';
    }

    // Background vertical gradient 0x12275c -> 0x070d24
    const bgGfx = this.add.graphics();
    const bgBands = 24;
    for (let i = 0; i < bgBands; i += 1) {
      const col = lerpColor(0x12275c, 0x070d24, i / (bgBands - 1));
      const y0 = Math.round((i * 720) / bgBands);
      const y1 = Math.round(((i + 1) * 720) / bgBands);
      bgGfx.fillStyle(col, 1);
      bgGfx.fillRect(0, y0, 1280, y1 - y0);
    }

    // Main outer panel (24, 20, 1232, 680)
    const mainPanel = this.add.graphics();
    drawNeonPanel(mainPanel, 24, 20, 1232, 680);

    // Header icon + Title + Research Points + Red X button aligned on y = 53
    const headerDecor = this.add.graphics();
    headerDecor.lineStyle(2.5, 0x3fd2ff, 1);
    headerDecor.strokeCircle(56, 53, 14);
    headerDecor.fillStyle(0x3fd2ff, 1);
    headerDecor.fillCircle(56, 53, 5);
    headerDecor.fillRect(36, 84, 1208, 2);

    this.add
      .text(82, 53, 'Technology Tree', {
        fontFamily: UI.font,
        fontStyle: '700',
        fontSize: '29px',
        color: UI.white,
      })
      .setOrigin(0, 0.5);

    this.rpText = this.add
      .text(
        1180,
        53,
        `Research Points: ${state.rewards.researchPoints || 0}`,
        {
          fontFamily: UI.font,
          fontStyle: '600',
          fontSize: '17px',
          color: '#8fd0ff',
        }
      )
      .setOrigin(1, 0.5);

    this.closeBtnGfx = this.add.graphics();
    this._drawCloseButton(false);

    const closeHit = this.add
      .rectangle(1196, 33, 40, 40, 0x000000, 0)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true });
    closeHit.on('pointerover', () => this._drawCloseButton(true));
    closeHit.on('pointerout', () => this._drawCloseButton(false));
    closeHit.on('pointerdown', () => this.closeTree());

    this.add
      .text(1216, 53, 'X', {
        fontFamily: UI.font,
        fontStyle: '700',
        fontSize: '22px',
        color: UI.white,
      })
      .setOrigin(0.5, 0.5);

    // Center tree canvas panel (292, 98, 598, 590) & Right detail panel (904, 98, 332, 590)
    const treePanel = this.add.graphics();
    drawNeonPanel(treePanel, 292, 98, 598, 590);

    const detailPanel = this.add.graphics();
    drawNeonPanel(detailPanel, 904, 98, 332, 590);

    // Branch pills (left) at x = 38, dispW = 240 (dispH = 76), py = 102 + idx * 90 (14 px gap, zero overlap)
    this.branchOutlineGfx = this.add.graphics();
    this.branchBadgesContainer = this.add.container(0, 0);
    this.branchPills = [];

    BRANCHES.forEach((branch, idx) => {
      const px = 38;
      const py = 102 + idx * 90;
      const img = this.add.image(px, py, branch.pill).setOrigin(0, 0);
      const dispW = 240;
      const dispH =
        img.width > 0 ? Math.round((dispW * img.height) / img.width) : 76;
      img.setDisplaySize(dispW, dispH);
      img.setInteractive({ useHandCursor: true });

      // Fit branch name cleanly inside the pill's recessed right plate (px+90 .. px+224)
      const label = this.add
        .text(px + 91, py + Math.round(dispH * 0.5), branch.name, {
          fontFamily: UI.font,
          fontStyle: '700',
          fontSize: '18px',
          color: '#ffffff',
          stroke: '#07173a',
          strokeThickness: 4,
        })
        .setOrigin(0, 0.5);
      if (label.width > 122) {
        label.setScale(122 / label.width);
      }

      img.on('pointerdown', () => {
        if (this._busy) return;
        if (this.selectedBranchIndex !== idx) {
          audio.play('SFX_Tab_Switch');
          this.selectedBranchIndex = idx;
          const firstNode =
            branch.id === 'tools'
              ? state.objectiveIndex <= 8
                ? 'basic_material_processing'
                : 'basic_mining'
              : branch.nodes[0].id;
          this._selectNode(firstNode, false);
        }
      });

      this.branchPills.push({
        branch,
        idx,
        px,
        py,
        dispW,
        dispH,
        img,
        label,
      });
    });

    // Tree header + dynamic containers
    this.branchTitleText = this.add
      .text(314, 112, '', {
        fontFamily: UI.font,
        fontStyle: '700',
        fontSize: '22px',
        color: '#3fd2ff',
      })
      .setOrigin(0, 0);

    this.connectorsGfx = this.add.graphics();
    this.nodesContainer = this.add.container(0, 0);
    this.detailContainer = this.add.container(0, 0);

    // Legend at bottom of tree canvas
    this._buildLegend();

    // Keyboard: ESC or technology key (C) closes
    this._onKeyDown = (event) => {
      if (this._closing) return;
      if (performance.now() - this._openedAt < 120) return;

      if (event.code === 'Escape' || event.key === 'Escape') {
        event.preventDefault();
        this.closeTree();
        return;
      }

      if (this._matchesTechnologyKey(event)) {
        event.preventDefault();
        this.closeTree();
      }
    };
    this.input.keyboard.on('keydown', this._onKeyDown);

    // Auto-close softly if Objective 10 completes while viewing next research inside the tree
    this._onObjectiveComplete = (completedIdx) => {
      if (completedIdx === 9 && !this._closing) {
        audio.play('SFX_Objective_Complete');
        this.time.delayedCall(650, () => {
          if (!this._closing) {
            this.closeTree();
          }
        });
      }
    };
    bus.on('objective:complete', this._onObjectiveComplete);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this._cleanupProgress();
      this._clearPulseTweens();
      if (this.input && this.input.keyboard) {
        this.input.keyboard.off('keydown', this._onKeyDown);
      }
      bus.off('objective:complete', this._onObjectiveComplete);
      if (typeof window !== 'undefined' && window.__astro) {
        window.__astro.techScene = null;
      }
    });

    if (typeof window !== 'undefined' && window.__astro) {
      window.__astro.techScene = this;
    }

    this._renderAll();
  }

  _matchesTechnologyKey(event) {
    const saved = SaveManager.get();
    const pair = saved?.settings?.keys?.technology || ['C', null];
    const pressedKey = String(event.key || '').toUpperCase();
    const pressedCode = String(event.code || '').toUpperCase();
    for (const bound of pair) {
      if (!bound) continue;
      const b = String(bound).toUpperCase();
      if (pressedKey === b || pressedCode === `KEY${b}`) return true;
    }
    return false;
  }

  _drawCloseButton(hover) {
    this.closeBtnGfx.clear();
    const x = 1196;
    const y = 33;
    const w = 40;
    const h = 40;
    const topCol = hover ? 0xff8282 : 0xff6b6b;
    const botCol = hover ? 0xe03a3a : 0xd12f2f;

    this.closeBtnGfx.fillStyle(botCol, 1);
    this.closeBtnGfx.fillRoundedRect(x, y, w, h, 8);
    const bands = 6;
    for (let i = 0; i < bands; i += 1) {
      const col = lerpColor(topCol, botCol, i / (bands - 1));
      const by0 = y + Math.round((i * h) / bands);
      const by1 = y + Math.round(((i + 1) * h) / bands);
      const inset = i === 0 || i === bands - 1 ? 2 : 0;
      this.closeBtnGfx.fillStyle(col, 1);
      this.closeBtnGfx.fillRect(x + inset, by0, w - inset * 2, by1 - by0);
    }
    this.closeBtnGfx.lineStyle(3, 0xffd0d0, 1);
    this.closeBtnGfx.strokeRoundedRect(x, y, w, h, 8);
  }

  _buildLegend() {
    const legendGfx = this.add.graphics();
    legendGfx.fillStyle(0x163878, 0.8);
    legendGfx.fillRect(312, 632, 558, 1);

    const items = [
      { color: 0x99e105, label: 'Researched', x: 316 },
      { color: 0xffd94d, label: 'New', x: 434 },
      { color: 0x3fd2ff, label: 'Available', x: 506 },
      { color: 0xffb02e, label: 'Next Mission', x: 612 },
      { color: 0x6b7aa8, label: 'Locked', x: 744 },
    ];
    for (const item of items) {
      legendGfx.fillStyle(item.color, 1);
      legendGfx.fillCircle(item.x, 656, 5.5);
      this.add
        .text(item.x + 11, 656, item.label, {
          fontFamily: UI.font,
          fontStyle: '600',
          fontSize: '13px',
          color: '#dbe8ff',
        })
        .setOrigin(0, 0.5);
    }
  }

  _getNodeState(node) {
    if (node.id === 'basic_material_processing') {
      return state.tech.processing_researched ? 'done' : 'new';
    }
    if (node.done) return 'done';
    if (node.available) return 'available';
    if (node.next) {
      if (state.flags[`viewed_${node.id}`]) {
        return 'next_viewed';
      }
      if (state.objectiveIndex >= 9) {
        return 'next';
      }
    }
    return 'locked';
  }

  _findNodeById(nodeId) {
    for (let bIdx = 0; bIdx < BRANCHES.length; bIdx += 1) {
      for (const node of BRANCHES[bIdx].nodes) {
        if (node.id === nodeId) {
          return { branchIndex: bIdx, branch: BRANCHES[bIdx], node };
        }
      }
    }
    return null;
  }

  _checkNextResearchReviewed() {
    if (
      state.objectiveIndex === 9 &&
      state.flags.viewed_oxygen_recovery &&
      state.flags.viewed_basic_solar_systems
    ) {
      state.set('next_research_reviewed');
    }
  }

  _selectNode(nodeId, playSound = true) {
    if (this._busy) return;
    const found = this._findNodeById(nodeId);
    if (!found) return;

    this.selectedBranchIndex = found.branchIndex;
    this.selectedNodeId = found.node.id;

    if (playSound) {
      audio.play('SFX_Item_Select');
    }

    if (found.node.next) {
      state.setFlag(`viewed_${found.node.id}`, true);
      this._checkNextResearchReviewed();
    }

    this._renderAll();
  }

  _clearPulseTweens() {
    for (const tw of this._pulseTweens) {
      if (tw) tw.stop();
    }
    this._pulseTweens = [];
  }

  _renderAll() {
    this.rpText.setText(
      `Research Points: ${state.rewards.researchPoints || 0}`
    );
    this._renderBranchPills();
    this._renderTreeCanvas();
    this._renderDetailPanel();
  }

  _renderBranchPills() {
    this.branchOutlineGfx.clear();
    this.branchBadgesContainer.removeAll(true);

    const showObj10Badges =
      state.objectiveIndex === 9 && !state.has('next_research_reviewed');

    for (const p of this.branchPills) {
      const isSel = p.idx === this.selectedBranchIndex;
      p.img.setAlpha(isSel ? 1 : 0.78);
      p.label.setColor(isSel ? '#fff6c4' : '#e6f0ff');

      if (isSel) {
        // Left neon-gold indicator bar + right chevron inside the pill's recessed plate
        this.branchOutlineGfx.fillStyle(0xffc83d, 1);
        this.branchOutlineGfx.fillRoundedRect(
          p.px - 8,
          p.py + 14,
          4,
          p.dispH - 28,
          2
        );

        const cx = p.px + p.dispW - 20;
        const cy = p.py + Math.round(p.dispH * 0.5);
        this.branchOutlineGfx.lineStyle(2.5, 0xffd94d, 1);
        this.branchOutlineGfx.beginPath();
        this.branchOutlineGfx.moveTo(cx - 3, cy - 5);
        this.branchOutlineGfx.lineTo(cx + 3, cy);
        this.branchOutlineGfx.lineTo(cx - 3, cy + 5);
        this.branchOutlineGfx.strokePath();
      }

      if (
        showObj10Badges &&
        (p.branch.id === 'life_support' || p.branch.id === 'power')
      ) {
        const viewed =
          p.branch.id === 'life_support'
            ? Boolean(state.flags.viewed_oxygen_recovery)
            : Boolean(state.flags.viewed_basic_solar_systems);

        const bx = p.px + p.dispW - 50;
        const by = p.py + 3;
        const bw = viewed ? 24 : 44;
        const bh = 18;
        const badgeGfx = this.add.graphics();
        badgeGfx.fillStyle(viewed ? 0x164a12 : 0xffb02e, 1);
        badgeGfx.fillRoundedRect(bx, by, bw, bh, 5);
        badgeGfx.lineStyle(1.5, viewed ? 0x99e105 : 0xfff2b0, 1);
        badgeGfx.strokeRoundedRect(bx, by, bw, bh, 5);

        const badgeTxt = this.add
          .text(bx + bw / 2, by + bh / 2, viewed ? 'OK' : 'NEXT', {
            fontFamily: UI.font,
            fontStyle: '700',
            fontSize: '11px',
            color: viewed ? '#99e105' : '#1a1204',
          })
          .setOrigin(0.5, 0.5);

        this.branchBadgesContainer.add([badgeGfx, badgeTxt]);
      }
    }
  }

  _getLayoutForBranch(branch) {
    // Tree canvas spans x = 292..890 (width 598, center x = 591)
    if (branch.id === 'tools') {
      const byId = {};
      for (const n of branch.nodes) byId[n.id] = n;
      const topY = state.objectiveIndex === 9 ? 250 : 232;
      const botY = state.objectiveIndex === 9 ? 426 : 412;
      return {
        positions: [
          { node: byId.basic_mining, x: 387, y: topY },
          { node: byId.improved_pickaxe, x: 523, y: topY },
          { node: byId.advanced_drill, x: 659, y: topY },
          { node: byId.repair_equipment, x: 795, y: topY },
          { node: byId.basic_material_processing, x: 387, y: botY },
        ],
        segments: [
          [387 + 44, topY, 523 - 44, topY],
          [523 + 44, topY, 659 - 44, topY],
          [659 + 44, topY, 795 - 44, topY],
          [387, topY + 48, 387, botY - 48],
        ],
      };
    }

    const count = branch.nodes.length;
    const rowY = state.objectiveIndex === 9 ? 310 : 292;
    const spacing = count >= 4 ? 136 : 160;
    const startX = Math.round(591 - ((count - 1) * spacing) / 2);

    const positions = branch.nodes.map((node, i) => ({
      node,
      x: startX + i * spacing,
      y: rowY,
    }));
    const segments = [];
    for (let i = 0; i < positions.length - 1; i += 1) {
      segments.push([
        positions[i].x + 44,
        rowY,
        positions[i + 1].x - 44,
        rowY,
      ]);
    }
    return { positions, segments };
  }

  _renderObj10Banner() {
    if (state.objectiveIndex !== 9) return;

    const seenO2 = Boolean(state.flags.viewed_oxygen_recovery);
    const seenSolar = Boolean(state.flags.viewed_basic_solar_systems);

    const bannerGfx = this.add.graphics();
    bannerGfx.fillStyle(0x061433, 0.92);
    bannerGfx.fillRoundedRect(312, 146, 558, 42, 7);
    bannerGfx.lineStyle(1.5, 0xffb02e, 0.85);
    bannerGfx.strokeRoundedRect(312, 146, 558, 42, 7);

    const prompt = this.add
      .text(324, 167, 'Next Research:', {
        fontFamily: UI.font,
        fontStyle: '700',
        fontSize: '13px',
        color: '#ffd23f',
      })
      .setOrigin(0, 0.5);

    this.nodesContainer.add([bannerGfx, prompt]);

    const chips = [
      {
        nodeId: 'oxygen_recovery',
        done: seenO2,
        text: 'Oxygen Recovery (Life)',
        x: 434,
        w: 204,
      },
      {
        nodeId: 'basic_solar_systems',
        done: seenSolar,
        text: 'Basic Solar (Power)',
        x: 648,
        w: 210,
      },
    ];

    for (const c of chips) {
      const isCurrent = this.selectedNodeId === c.nodeId;
      const chipGfx = this.add.graphics();
      chipGfx.fillStyle(c.done ? 0x0e3314 : 0x102754, 1);
      chipGfx.fillRoundedRect(c.x, 152, c.w, 30, 6);
      chipGfx.lineStyle(
        1.5,
        c.done ? 0x99e105 : isCurrent ? 0xffffff : 0xffb02e,
        1
      );
      chipGfx.strokeRoundedRect(c.x, 152, c.w, 30, 6);

      // Mini checkbox inside chip
      const bx = c.x + 10;
      const by = 160;
      chipGfx.fillStyle(c.done ? 0x99e105 : 0x050a1c, 1);
      chipGfx.fillRoundedRect(bx, by, 14, 14, 3);
      chipGfx.lineStyle(1.5, c.done ? 0x99e105 : 0xffd23f, 1);
      chipGfx.strokeRoundedRect(bx, by, 14, 14, 3);
      if (c.done) {
        chipGfx.lineStyle(2, 0x071a08, 1);
        chipGfx.beginPath();
        chipGfx.moveTo(bx + 3, by + 7);
        chipGfx.lineTo(bx + 6, by + 10);
        chipGfx.lineTo(bx + 11, by + 4);
        chipGfx.strokePath();
      }

      const chipTxt = this.add
        .text(c.x + 30, 167, c.text, {
          fontFamily: UI.font,
          fontStyle: '600',
          fontSize: '13px',
          color: c.done ? '#b8ff9e' : '#ffffff',
        })
        .setOrigin(0, 0.5);

      const chipHit = this.add
        .rectangle(c.x, 152, c.w, 30, 0x000000, 0)
        .setOrigin(0, 0)
        .setInteractive({ useHandCursor: true });
      chipHit.on('pointerdown', () => {
        this._selectNode(c.nodeId, true);
      });

      this.nodesContainer.add([chipGfx, chipTxt, chipHit]);
    }
  }

  _renderTreeCanvas() {
    this._clearPulseTweens();
    this.nodesContainer.removeAll(true);
    this.connectorsGfx.clear();

    const branch = BRANCHES[this.selectedBranchIndex];
    this.branchTitleText.setText(`${branch.name} Research Tree`);

    this._renderObj10Banner();

    const { positions, segments } = this._getLayoutForBranch(branch);

    // Draw connector lines with neon glow
    for (const [x1, y1, x2, y2] of segments) {
      this.connectorsGfx.lineStyle(8, 0x26a8ff, 0.25);
      this.connectorsGfx.beginPath();
      this.connectorsGfx.moveTo(x1, y1);
      this.connectorsGfx.lineTo(x2, y2);
      this.connectorsGfx.strokePath();

      this.connectorsGfx.lineStyle(3, 0x26a8ff, 0.9);
      this.connectorsGfx.beginPath();
      this.connectorsGfx.moveTo(x1, y1);
      this.connectorsGfx.lineTo(x2, y2);
      this.connectorsGfx.strokePath();
    }

    for (const { node, x, y } of positions) {
      if (!node) continue;
      const nodeState = this._getNodeState(node);
      const isSel = this.selectedNodeId === node.id;

      const itemWrap = this.add.container(x, y);

      let iconKey = node.icon;
      if (
        node.id === 'basic_mining' &&
        isSel &&
        this.textures.exists('tree_n_pickaxe_selected')
      ) {
        iconKey = 'tree_n_pickaxe_selected';
      }

      const icon = this.add.image(0, 0, iconKey).setDisplaySize(96, 96);
      itemWrap.add(icon);

      // Ring & badge by state
      if (nodeState === 'done') {
        const ring = this.add.graphics();
        ring.lineStyle(3, 0x99e105, 1);
        ring.strokeCircle(0, 0, 44);
        itemWrap.add(ring);
      } else if (nodeState === 'new') {
        const ring = this.add.graphics();
        ring.lineStyle(3, 0xffd94d, 1);
        ring.strokeCircle(0, 0, 45);
        itemWrap.add(ring);

        const tw = this.tweens.add({
          targets: ring,
          alpha: { from: 1, to: 0.45 },
          duration: 700,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
        this._pulseTweens.push(tw);

        const tagBg = this.add.graphics();
        tagBg.fillStyle(0xffd94d, 1);
        tagBg.fillRoundedRect(10, -48, 44, 18, 5);
        const tagTxt = this.add
          .text(32, -39, 'NEW', {
            fontFamily: UI.font,
            fontStyle: '700',
            fontSize: '12px',
            color: '#1a1a2e',
          })
          .setOrigin(0.5, 0.5);
        itemWrap.add([tagBg, tagTxt]);
      } else if (nodeState === 'next') {
        const ring = this.add.graphics();
        ring.lineStyle(3.5, 0xffb02e, 1);
        ring.strokeCircle(0, 0, 45);
        itemWrap.add(ring);

        const tw = this.tweens.add({
          targets: ring,
          alpha: { from: 1, to: 0.4 },
          duration: 650,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
        this._pulseTweens.push(tw);

        const tagBg = this.add.graphics();
        tagBg.fillStyle(0xffb02e, 1);
        tagBg.fillRoundedRect(6, -48, 48, 18, 5);
        const tagTxt = this.add
          .text(30, -39, 'NEXT', {
            fontFamily: UI.font,
            fontStyle: '700',
            fontSize: '12px',
            color: '#1a1204',
          })
          .setOrigin(0.5, 0.5);
        itemWrap.add([tagBg, tagTxt]);
      } else if (nodeState === 'next_viewed') {
        const ring = this.add.graphics();
        ring.lineStyle(3, 0x99e105, 1);
        ring.strokeCircle(0, 0, 44);
        itemWrap.add(ring);

        const tagBg = this.add.graphics();
        tagBg.fillStyle(0x164a12, 1);
        tagBg.fillRoundedRect(0, -48, 56, 18, 5);
        tagBg.lineStyle(1.5, 0x99e105, 1);
        tagBg.strokeRoundedRect(0, -48, 56, 18, 5);
        const tagTxt = this.add
          .text(28, -39, 'VIEWED', {
            fontFamily: UI.font,
            fontStyle: '700',
            fontSize: '11px',
            color: '#99e105',
          })
          .setOrigin(0.5, 0.5);
        itemWrap.add([tagBg, tagTxt]);
      } else if (nodeState === 'available') {
        const ring = this.add.graphics();
        ring.lineStyle(3, 0x3fd2ff, 1);
        ring.strokeCircle(0, 0, 44);
        itemWrap.add(ring);
      }

      if (isSel) {
        const selRing = this.add.graphics();
        selRing.lineStyle(2.5, 0xffffff, 0.92);
        selRing.strokeCircle(0, 0, 50);
        itemWrap.add(selRing);
      }

      const hit = this.add
        .circle(0, 0, 48, 0x000000, 0)
        .setInteractive({ useHandCursor: true });

      hit.on('pointerover', () => {
        itemWrap.setScale(1.08);
      });
      hit.on('pointerout', () => {
        itemWrap.setScale(1);
      });
      hit.on('pointerdown', () => {
        this._selectNode(node.id, true);
      });
      itemWrap.add(hit);

      const label = this.add
        .text(x, y + 54, node.name, {
          fontFamily: UI.font,
          fontStyle: '600',
          fontSize: '14px',
          color: '#dbe8ff',
          align: 'center',
          wordWrap: { width: 122 },
        })
        .setOrigin(0.5, 0);

      if (label.x - label.width / 2 < 300) {
        label.x = Math.ceil(300 + label.width / 2);
      } else if (label.x + label.width / 2 > 882) {
        label.x = Math.floor(882 - label.width / 2);
      }

      this.nodesContainer.add([itemWrap, label]);
    }
  }

  _renderDetailPanel() {
    this.detailContainer.removeAll(true);
    const found = this._findNodeById(this.selectedNodeId);
    if (!found) return;
    const { node } = found;

    if (node.id === 'basic_material_processing') {
      if (!state.tech.processing_researched) {
        this._renderProcessingResearchDetail();
      } else {
        this._renderProcessorCraftDetail();
      }
      return;
    }

    const nodeState = this._getNodeState(node);
    const title = this.add
      .text(922, 120, node.name, {
        fontFamily: UI.font,
        fontStyle: '700',
        fontSize: '25px',
        color: UI.white,
        wordWrap: { width: 296 },
      })
      .setOrigin(0, 0);

    const stateY = 120 + Math.ceil(title.height) + 10;
    let dotCol = 0x6b7aa8;
    let stateLabel = 'Locked';
    let stateCss = '#9db0d8';
    if (nodeState === 'done') {
      dotCol = 0x99e105;
      stateLabel = 'Researched';
      stateCss = '#99e105';
    } else if (nodeState === 'available') {
      dotCol = 0x3fd2ff;
      stateLabel = 'Available';
      stateCss = '#3fd2ff';
    } else if (node.next) {
      const viewed = Boolean(state.flags[`viewed_${node.id}`]);
      dotCol = viewed ? 0x99e105 : 0xffb02e;
      stateLabel = viewed
        ? 'Next mission research (Reviewed)'
        : 'Next mission research';
      stateCss = viewed ? '#99e105' : '#ffc83d';
    }

    const dotGfx = this.add.graphics();
    dotGfx.fillStyle(dotCol, 1);
    dotGfx.fillCircle(929, stateY + 9, 5);

    const statusTxt = this.add
      .text(942, stateY, stateLabel, {
        fontFamily: UI.font,
        fontStyle: '600',
        fontSize: '15px',
        color: stateCss,
      })
      .setOrigin(0, 0);

    const descY = stateY + 32;
    const bodyStr = NODE_TEXT[node.id] || LOCKED_TEXT;
    const bodyTxt = this.add
      .text(922, descY, bodyStr, {
        fontFamily: UI.font,
        fontStyle: '500',
        fontSize: '16px',
        color: '#dbe8ff',
        wordWrap: { width: 296 },
        lineSpacing: 5,
      })
      .setOrigin(0, 0);

    this.detailContainer.add([title, dotGfx, statusTxt, bodyTxt]);

    // Objective 10 guided step button inside Detail Panel
    if (state.objectiveIndex === 9) {
      if (!state.has('next_research_reviewed')) {
        const nextTargetId = !state.flags.viewed_oxygen_recovery
          ? 'oxygen_recovery'
          : 'basic_solar_systems';
        const btnLabel =
          nextTargetId === 'oxygen_recovery'
            ? 'Inspect Oxygen Recovery'
            : 'Inspect Basic Solar Systems';

        const hintTxt = this.add
          .text(
            922,
            578,
            'Objective 10: Review both next-mission technologies.',
            {
              fontFamily: UI.font,
              fontStyle: '500',
              fontSize: '13px',
              color: '#ffd94d',
              wordWrap: { width: 296 },
            }
          )
          .setOrigin(0, 0);
        this.detailContainer.add(hintTxt);

        this._addDetailActionArea({
          label: btnLabel,
          fontSize: '18px',
          enabled: true,
          canRejectSound: false,
          onTrigger: () => this._selectNode(nextTargetId, true),
        });
      } else if (!state.has('life_support_checked')) {
        const doneBox = this.add.graphics();
        doneBox.fillStyle(0x0d2f14, 0.9);
        doneBox.fillRoundedRect(922, 604, 296, 62, 8);
        doneBox.lineStyle(1.5, 0x99e105, 1);
        doneBox.strokeRoundedRect(922, 604, 296, 62, 8);

        const doneTxt = this.add
          .text(
            1070,
            635,
            'Next research reviewed!\nClose (ESC) and check Life Support.',
            {
              fontFamily: UI.font,
              fontStyle: '600',
              fontSize: '14px',
              color: '#b8ff9e',
              align: 'center',
            }
          )
          .setOrigin(0.5, 0.5);
        this.detailContainer.add([doneBox, doneTxt]);
      }
    }
  }

  _renderProcessingResearchDetail() {
    const title = this.add
      .text(922, 118, 'Basic Material Processing', {
        fontFamily: UI.font,
        fontStyle: '700',
        fontSize: '25px',
        color: UI.white,
        wordWrap: { width: 296 },
      })
      .setOrigin(0, 0);

    const stateY = 118 + Math.ceil(title.height) + 8;
    const dot = this.add.graphics();
    dot.fillStyle(0xffd94d, 1);
    dot.fillCircle(929, stateY + 9, 5);

    const stateTxt = this.add
      .text(942, stateY, 'New research', {
        fontFamily: UI.font,
        fontStyle: '600',
        fontSize: '15px',
        color: '#ffd94d',
      })
      .setOrigin(0, 0);

    const descY = stateY + 28;
    const desc = this.add
      .text(922, descY, 'Scan your lunar samples to learn how to process them.', {
        fontFamily: UI.font,
        fontStyle: '500',
        fontSize: '15px',
        color: '#dbe8ff',
        wordWrap: { width: 296 },
        lineSpacing: 3,
      })
      .setOrigin(0, 0);

    const reqHeaderY = descY + Math.ceil(desc.height) + 16;
    const reqHeader = this.add
      .text(922, reqHeaderY, 'Requires', {
        fontFamily: UI.font,
        fontStyle: '700',
        fontSize: '18px',
        color: '#3fd2ff',
      })
      .setOrigin(0, 0);

    const reqRows = [
      {
        icon: 'tree_res_regolith',
        name: 'Lunar Regolith',
        n: state.storage.lunar_regolith_sample || 0,
        need: 5,
      },
      {
        icon: 'tree_res_ironrock',
        name: 'Iron-bearing Rock',
        n: state.storage.ilmenite_bearing_basalt_sample || 0,
        need: 5,
      },
      {
        icon: 'tree_res_silicate',
        name: 'Silicate Rock',
        n: state.storage.silicate_rich_rock_sample || 0,
        need: 5,
      },
    ];

    this.detailContainer.add([title, dot, stateTxt, desc, reqHeader]);

    let rowY = reqHeaderY + 30;
    for (const r of reqRows) {
      const rowBg = this.add.graphics();
      rowBg.fillStyle(0x050e28, 0.7);
      rowBg.fillRoundedRect(922, rowY, 296, 48, 6);
      rowBg.lineStyle(1, 0x1b4a8c, 1);
      rowBg.strokeRoundedRect(922, rowY, 296, 48, 6);

      const ic = this.add
        .image(948, rowY + 24, r.icon)
        .setDisplaySize(44, 44);
      const nm = this.add
        .text(976, rowY + 24, r.name, {
          fontFamily: UI.font,
          fontStyle: '600',
          fontSize: '15px',
          color: UI.white,
        })
        .setOrigin(0, 0.5);
      const ok = r.n >= r.need;
      const ct = this.add
        .text(1208, rowY + 24, `${r.n} / ${r.need}`, {
          fontFamily: UI.font,
          fontStyle: '700',
          fontSize: '15px',
          color: ok ? '#99e105' : UI.white,
        })
        .setOrigin(1, 0.5);

      this.detailContainer.add([rowBg, ic, nm, ct]);
      rowY += 54;
    }

    const note = this.add
      .text(
        922,
        rowY + 8,
        'The scan records data from the samples. Your samples are not used up.',
        {
          fontFamily: UI.font,
          fontStyle: '500',
          fontSize: '14px',
          color: '#aeb7ea',
          wordWrap: { width: 296 },
          lineSpacing: 2,
        }
      )
      .setOrigin(0, 0);
    this.detailContainer.add(note);

    const canResearch = reqRows.every((r) => r.n >= r.need);
    this._addDetailActionArea({
      label: 'Research',
      enabled: canResearch,
      canRejectSound: true,
      onTrigger: () => this._startProgressAction('research'),
    });
  }

  _renderProcessorCraftDetail() {
    const crafted = Boolean(state.tech.processor_crafted);

    const title = this.add
      .text(922, 114, 'Basic Material Processor', {
        fontFamily: UI.font,
        fontStyle: '700',
        fontSize: '24px',
        color: UI.white,
        wordWrap: { width: 296 },
      })
      .setOrigin(0, 0);

    const stateY = 114 + Math.ceil(title.height) + 6;
    const dot = this.add.graphics();
    dot.fillStyle(0x99e105, 1);
    dot.fillCircle(929, stateY + 8, 5);

    const stateTxt = this.add
      .text(942, stateY, 'Researched', {
        fontFamily: UI.font,
        fontStyle: '600',
        fontSize: '14px',
        color: '#99e105',
      })
      .setOrigin(0, 0);

    const descY = stateY + 24;
    const desc = this.add
      .text(
        922,
        descY,
        'A simple machine that crushes and sorts lunar samples.',
        {
          fontFamily: UI.font,
          fontStyle: '500',
          fontSize: '14px',
          color: '#dbe8ff',
          wordWrap: { width: 296 },
          lineSpacing: 2,
        }
      )
      .setOrigin(0, 0);

    const ingHeaderY = descY + Math.ceil(desc.height) + 10;
    const ingHeader = this.add
      .text(922, ingHeaderY, 'Ingredients', {
        fontFamily: UI.font,
        fontStyle: '700',
        fontSize: '17px',
        color: '#3fd2ff',
      })
      .setOrigin(0, 0);

    const kitCount =
      (state.storage.spare_parts_kit || 0) + inventory.count('spare_parts_kit');

    const ingRows = [
      {
        icon: 'tree_res_regolith',
        name: 'Lunar Regolith',
        n: state.storage.lunar_regolith_sample || 0,
        need: 5,
      },
      {
        icon: 'tree_res_ironrock',
        name: 'Iron-bearing Rock',
        n: state.storage.ilmenite_bearing_basalt_sample || 0,
        need: 5,
      },
      {
        icon: 'tree_res_silicate',
        name: 'Silicate Rock',
        n: state.storage.silicate_rich_rock_sample || 0,
        need: 5,
      },
      {
        icon: 'icon_kit',
        name: 'Spare Parts Kit',
        n: kitCount,
        need: 1,
      },
    ];

    this.detailContainer.add([title, dot, stateTxt, desc, ingHeader]);

    let rowY = ingHeaderY + 24;
    for (const r of ingRows) {
      const rowBg = this.add.graphics();
      rowBg.fillStyle(0x050e28, 0.7);
      rowBg.fillRoundedRect(922, rowY, 296, 36, 5);
      rowBg.lineStyle(1, 0x1b4a8c, 1);
      rowBg.strokeRoundedRect(922, rowY, 296, 36, 5);

      const ic = this.add
        .image(943, rowY + 18, r.icon)
        .setDisplaySize(32, 32);
      const nm = this.add
        .text(966, rowY + 18, r.name, {
          fontFamily: UI.font,
          fontStyle: '600',
          fontSize: '14px',
          color: UI.white,
        })
        .setOrigin(0, 0.5);
      const ok = crafted || r.n >= r.need;
      const shownCount = crafted ? `${r.need} / ${r.need}` : `${r.n} / ${r.need}`;
      const ct = this.add
        .text(1208, rowY + 18, shownCount, {
          fontFamily: UI.font,
          fontStyle: '700',
          fontSize: '14px',
          color: ok ? '#99e105' : UI.white,
        })
        .setOrigin(1, 0.5);

      this.detailContainer.add([rowBg, ic, nm, ct]);
      rowY += 40;
    }

    const resHeaderY = rowY + 4;
    const resHeader = this.add
      .text(922, resHeaderY, 'Result', {
        fontFamily: UI.font,
        fontStyle: '700',
        fontSize: '16px',
        color: '#3fd2ff',
      })
      .setOrigin(0, 0);

    const resRowY = resHeaderY + 22;
    const resBg = this.add.graphics();
    resBg.fillStyle(0x081a3e, 0.9);
    resBg.fillRoundedRect(922, resRowY, 296, 38, 6);
    resBg.lineStyle(1, 0x2f7fd6, 1);
    resBg.strokeRoundedRect(922, resRowY, 296, 38, 6);

    const resIcon = this.add
      .image(945, resRowY + 19, 'tree_res_gear')
      .setDisplaySize(36, 30);
    const resLabel = this.add
      .text(970, resRowY + 19, 'Basic Material Processor x1', {
        fontFamily: UI.font,
        fontStyle: '700',
        fontSize: '14px',
        color: UI.gold,
      })
      .setOrigin(0, 0.5);

    const noteStr = crafted
      ? 'Go and install it in the outpost with E.'
      : 'After crafting, install it in the outpost with E.';
    const note = this.add
      .text(922, resRowY + 44, noteStr, {
        fontFamily: UI.font,
        fontStyle: '500',
        fontSize: '13px',
        color: '#aeb7ea',
        wordWrap: { width: 296 },
      })
      .setOrigin(0, 0);

    this.detailContainer.add([resHeader, resBg, resIcon, resLabel, note]);

    const canCraft = !crafted && ingRows.every((r) => r.n >= r.need);
    this._addDetailActionArea({
      label: crafted ? 'Crafted' : 'Craft',
      enabled: canCraft,
      canRejectSound: !crafted,
      onTrigger: () => this._startProgressAction('craft'),
    });
  }

  _addDetailActionArea({
    label,
    fontSize = '24px',
    enabled,
    canRejectSound,
    onTrigger,
  }) {
    const bx = 922;
    const by = 612;
    const bw = 296;
    const bh = 58;

    if (this._busy) {
      const statusLabel = this.add
        .text(
          bx + bw / 2,
          by + 12,
          this._busyMode === 'research' ? 'Researching...' : 'Crafting...',
          {
            fontFamily: UI.font,
            fontStyle: '700',
            fontSize: '16px',
            color: UI.gold,
          }
        )
        .setOrigin(0.5, 0.5);

      const barBg = this.add.graphics();
      barBg.fillStyle(0x05070f, 1);
      barBg.fillRoundedRect(bx, by + 30, bw, 16, 6);
      barBg.lineStyle(2, 0x2f7fd6, 1);
      barBg.strokeRoundedRect(bx, by + 30, bw, 16, 6);

      this._progressBarFill = this.add.graphics();
      this.detailContainer.add([statusLabel, barBg, this._progressBarFill]);
      return;
    }

    const btnGfx = this.add.graphics();
    drawGoldButton(btnGfx, bx, by, bw, bh, enabled, false);

    const btnTxt = this.add
      .text(bx + bw / 2, by + bh / 2, label, {
        fontFamily: UI.font,
        fontStyle: '700',
        fontSize,
        color: '#2a1a05',
      })
      .setOrigin(0.5, 0.5)
      .setAlpha(enabled ? 1 : 0.55);

    const btnHit = this.add
      .rectangle(bx, by, bw, bh, 0x000000, 0)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: enabled });

    btnHit.on('pointerover', () => {
      if (enabled && !this._busy) {
        drawGoldButton(btnGfx, bx, by, bw, bh, true, true);
      }
    });
    btnHit.on('pointerout', () => {
      if (enabled && !this._busy) {
        drawGoldButton(btnGfx, bx, by, bw, bh, true, false);
      }
    });
    btnHit.on('pointerdown', () => {
      if (this._busy) return;
      if (!enabled) {
        if (canRejectSound) {
          audio.play('SFX_Not_Enough_Resources');
        }
        return;
      }
      onTrigger();
    });

    this.detailContainer.add([btnGfx, btnTxt, btnHit]);
  }

  _cleanupProgress() {
    if (this._progressTimer) {
      this._progressTimer.remove(false);
      this._progressTimer = null;
    }
    if (this._activeLoopId) {
      audio.stop(this._activeLoopId, 80);
      this._activeLoopId = null;
    }
    this._busy = false;
  }

  _startProgressAction(mode) {
    if (this._busy) return;
    this._busy = true;
    this._busyMode = mode;

    const isResearch = mode === 'research';
    const startSfx = isResearch ? 'SFX_Research_Start' : 'SFX_Crafting_Start';
    const loopSfx = isResearch ? 'SFX_Research_Loop' : 'SFX_Crafting_Loop';
    const doneSfx = isResearch
      ? 'SFX_Research_Complete'
      : 'SFX_Crafting_Complete';

    audio.play(startSfx);
    audio.loop(loopSfx, { gain: 0.5 });
    this._activeLoopId = loopSfx;

    this._renderDetailPanel();

    const bx = 922;
    const by = 642;
    const bw = 296;
    const durationMs = 3500;
    const startedAt = performance.now();

    this._progressTimer = this.time.addEvent({
      delay: 16,
      loop: true,
      callback: () => {
        const elapsed = performance.now() - startedAt;
        const pct = Math.max(0, Math.min(1, elapsed / durationMs));
        if (this._progressBarFill && this._progressBarFill.scene) {
          this._progressBarFill.clear();
          const fw = Math.round(bw * pct);
          if (fw > 0) {
            this._progressBarFill.fillStyle(0xffd94d, 1);
            this._progressBarFill.fillRoundedRect(bx, by, fw, 16, 6);
          }
        }

        if (pct >= 1) {
          this._cleanupProgress();
          audio.play(doneSfx);

          if (isResearch) {
            state.tech.processing_researched = true;
            state.save();
            state.addScore(100, 'research');
            state.set('basic_material_processing_researched');
            this._researchedDuringSession = true;
            floatText(this, 1070, 594, 'Research complete!', UI.gold, {
              scrollFactor: 0,
              depth: 220,
            });
          } else {
            state.storage.lunar_regolith_sample = Math.max(
              0,
              (state.storage.lunar_regolith_sample || 0) - 5
            );
            state.storage.ilmenite_bearing_basalt_sample = Math.max(
              0,
              (state.storage.ilmenite_bearing_basalt_sample || 0) - 5
            );
            state.storage.silicate_rich_rock_sample = Math.max(
              0,
              (state.storage.silicate_rich_rock_sample || 0) - 5
            );
            if ((state.storage.spare_parts_kit || 0) > 0) {
              state.storage.spare_parts_kit -= 1;
            } else {
              inventory.remove('spare_parts_kit', 1);
            }
            state.tech.processor_crafted = true;
            state.save();
            bus.emit('inventory');
            state.addScore(100, 'craft');
            state.set('processor_crafted');
            this._craftedDuringSession = true;
            floatText(this, 1070, 594, 'Processor crafted!', UI.gold, {
              scrollFactor: 0,
              depth: 220,
            });
          }

          this._renderAll();
        }
      },
    });
  }

  closeTree() {
    if (this._closing) return;
    this._closing = true;
    this._cleanupProgress();
    audio.play('SFX_Menu_Close');

    const payload = {
      from: this.from,
      openedAtObj08: this._openedAtObj08,
      researchedNow: this._researchedDuringSession,
      craftedNow: this._craftedDuringSession,
    };

    const fromKey = this.from;
    this.scene.stop();
    if (fromKey && this.scene.manager.getScene(fromKey)) {
      const targetScene = this.scene.manager.getScene(fromKey);
      targetScene._escConsumedAt = performance.now();
      targetScene._interactCooldownUntil = performance.now() + 150;
      this.scene.resume(fromKey);
    }
    bus.emit('techtree:closed', payload);
  }
}

export default TechTreeScene;
