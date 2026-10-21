var rnd=function(v){return Math.round(v*2)/2;};
var half=function(v){return Math.round(v)/2;};

var SHAPES=[
  {v:'inward',n:'Inward slope',s:'drains to courtyard',d:'The roof falls toward the courtyard, so rain collects inside for harvesting. Tall outer walls give shade and privacy.'},
  {v:'outward',n:'Outward slope',s:'drains outside',d:'The roof falls away from the courtyard and sheds water outside. Outer eaves are low and the courtyard sees more sky.'},
  {v:'double',n:'Ridge (double slope)',s:'classic village roof',d:'A ridge over each wing sheds water both ways, with overhangs on the outer and courtyard sides. Good ventilation under the roof.'},
  {v:'flat',n:'Flat RCC',s:'slab with parapet',d:'A concrete slab with parapet and a small chajja. It allows a terrace or a future floor, but costs more and runs hotter.'}
];
var COVERS=[
  {v:'tile',n:'Clay tiles on MS purlins',c:0xB4573A},
  {v:'sheet',n:'Colour-coated metal sheet',c:0x6C8BA6},
  {v:'rcctile',n:'RCC sloped slab with tiles',c:0xA0482F}
];
var SYSTEMS=[
  {v:'brick',n:'Brick + cement',s:'load-bearing walls',d:'Nine-inch brick walls carry the roof, with RCC plinth band, lintels and roof band. Lowest cost for a single storey.'},
  {v:'rcc',n:'RCC frame + brick',s:'concrete columns',d:'RCC columns and beams carry the roof, brick is only infill. Easiest to extend upward later.'},
  {v:'ms',n:'MS columns + brick',s:'steel columns',d:'Steel columns and beams with brick infill. Faster to build and lighter, but needs anti-rust paint and good welding.'}
];
/* which way the entrance faces. The plan keeps the entrance wing at the top; the compass turns, and rooms are arranged for true Vastu zones */
var FACINGS=[{v:'N',n:'North',s:'classic'},{v:'E',n:'East',s:'sunrise'},{v:'W',n:'West'}];
var FROT={N:{N:'N',E:'E',S:'S',W:'W'},E:{N:'E',E:'S',S:'W',W:'N'},W:{N:'W',E:'N',S:'E',W:'S'}};
var DIRNAME={N:'north',E:'east',S:'south',W:'west'};
function facingOf(){return (typeof ST!=='undefined'&&ST&&FROT[ST.facing])?ST.facing:'N';}
function absDir(l,f){return FROT[f||facingOf()][l]||l;}
function absZone(z,f){if(!z||z==='centre') return z;var ns='',ew='';z.split('').forEach(function(c){var a=absDir(c,f);if(a==='N'||a==='S') ns=a;else ew=a;});return (ns+ew)||'centre';}
var WALL_OUT=[
  {v:'brick',n:'Brick',s:'9 in, plastered',d:'Burnt clay brick, one brick thick, with cement plaster both faces.'},
  {v:'fly',n:'Fly-ash brick',s:'9 in, lower cost',d:'Fly-ash bricks 230 × 100 × 75 mm: uniform, strong and cheaper than clay brick, with a smooth face that needs thinner plaster.'},
  {v:'aac',n:'AAC blocks',s:'8 in, lighter',d:'Autoclaved aerated concrete blocks 600 × 200 mm laid in thin-bed adhesive: lighter, faster and cooler than brick, with thinner plaster.'},
  {v:'glass',n:'Glass',s:'full height',d:'Full-height 12 mm toughened glass in an aluminium frame between the columns: a glass house. Glass lets in a lot of heat in India, so use low-E or double glazing, deep roof overhangs and curtains, and frosted glass for baths. Needs a column frame.'}
];
var WALL_IN=[
  {v:'brick',n:'Brick',s:'4.5 in',d:'Half-brick partitions with plaster both faces.'},
  {v:'fly',n:'Fly-ash brick',s:'4.5 in',d:'Half-brick fly-ash partitions with thin plaster.'},
  {v:'aac',n:'AAC blocks',s:'4 in',d:'100 mm AAC block partitions with thin plaster.'},
  {v:'gyp',n:'Gypsum board',s:'on MS frame',d:'12.5 mm gypsum boards screwed to both faces of a welded MS square-tube frame, joints taped and painted. Use moisture-resistant boards in baths and the kitchen.'},
  {v:'glass',n:'Glass',s:'partitions',d:'10 mm toughened glass partitions in a slim aluminium frame. Use frosted or fluted glass for bedrooms and baths.'},
  {v:'wpc',n:'WPC board',s:'on MS frame',d:'Wood-plastic composite boards screwed to both faces of a welded MS square-tube frame. Waterproof and termite-proof, factory finished so no paint is needed.'}
];
var WALLS=WALL_OUT; // kept for older saved designs
var BRICKS=[{v:'mod',n:'Modular 190 × 90 × 90 mm',L:190,W:90,H:90},{v:'conv',n:'Conventional 230 × 110 × 75 mm (9 × 4.5 × 3 in)',L:230,W:110,H:75},{v:'fly',n:'Fly-ash 230 × 100 × 75 mm',L:230,W:100,H:75}];
var MS_TUBES=[{v:'25x25x1.6',a:25,t:1.6},{v:'32x32x1.6',a:32,t:1.6},{v:'40x40x2.0',a:40,t:2.0},{v:'50x50x2.0',a:50,t:2.0},{v:'50x50x2.6',a:50,t:2.6}];
var WPC_T=[8,12,18];
/* finishes and fittings: each option scales the estimate line it belongs to */
var SPECS=[
  {k:'winFrame',n:'Window frames',def:'wood',o:[['wood','Wood (sal or teak)',1],['upvc','uPVC',0.92],['alu','Aluminium',0.72],['steel','MS steel',0.6]]},
  {k:'woodT',n:'Wood for windows and doors',def:'sal',o:[['teak','Teak',1.7],['sal','Sal',1],['honne','Honne (Indian kino)',1.05],['jack','Jackfruit (halasu)',1.2],['matti','Matti (terminalia)',0.9],['pine','Treated pine',0.75]]},
  {k:'winGlass',n:'Window glass',def:'clear',o:[['clear','Clear 5 mm',1],['tough','Toughened 8 mm',1.2],['dgu','Double glazed',1.55]]},
  {k:'mainDoor',n:'Main door',def:'sal',o:[['teak','Teak',1.7],['sal','Sal or honne wood',1],['wpc','WPC',0.7],['steel','Steel safety door',1.15]]},
  {k:'inDoor',n:'Inside doors',def:'flush',o:[['flush','Flush doors',1],['wpc','WPC doors',1.15],['panel','Wood panel doors',1.9]]},
  {k:'floorF',n:'Flooring',def:'vit',o:[['vit','Vitrified tiles',1],['granite','Granite',1.9],['kota','Kota or Shahabad stone',0.85],['redox','Red oxide',0.6],['wood','Wooden laminate',1.5],['cement','Polished concrete',0.7]]},
  {k:'kitchenC',n:'Kitchen counter',def:'granite',o:[['granite','Granite',1],['quartz','Quartz',1.35],['ss','Stainless steel',1.15]]},
  {k:'bathFit',n:'Bath fittings',def:'std',o:[['basic','Basic',0.75],['std','Standard',1],['prem','Premium',1.6]]},
  {k:'paintG',n:'Paint',def:'emul',o:[['eco','Distemper (economy)',0.7],['emul','Emulsion',1],['prem','Premium emulsion',1.4]]},
  {k:'elecG',n:'Switches and wiring',def:'std',o:[['basic','Basic',0.85],['std','Standard',1],['mod','Modular switches',1.25]]},
  {k:'curtains',n:'Curtains',def:'none',o:[['none','None',0],['sheer','Sheer, full height',1],['pair','Sheer and blackout, full height',1.8]]}
];
var ADDONS=[['ceiling','False ceiling in living, entry and dining'],['solar','Solar water heater, 200 litres',28000],['rwh','Rainwater harvesting pit',35000],['bore','Borewell with pump',120000],['compound','Compound wall']];
var FRAMECOL={wood:0x6B4423,upvc:0xF1F1EE,alu:0xA9ADB1,steel:0x3A3F44};
function specOf(S,k){var sp=SPECS.filter(function(x){return x.k===k;})[0];var v=(S.spec&&S.spec[k])||sp.def,o=sp.o.filter(function(x){return x[0]===v;})[0]||sp.o.filter(function(x){return x[0]===sp.def;})[0];return {v:o[0],n:o[1],f:o[2]};}
/* unit prices used by the comparison view (editable there) */
var MATRATES=[
  ['brick_conv','Clay brick 230 × 110 × 75 mm','nos',9],['brick_mod','Clay brick 190 × 90 × 90 mm','nos',8],['brick_fly','Fly-ash brick','nos',6.5],
  ['aac200','AAC block 200 mm','nos',95],['aac100','AAC block 100 mm','nos',55],['aacglue','AAC adhesive, 40 kg','bags',450],
  ['cement','Cement, 50 kg','bags',400],['sand','Sand (M-sand)','m³',1800],['mstube','MS square tube','kg',68],
  ['gypsheet','Gypsum board 8 × 4 ft','sheets',650],['wpc8','WPC board 8 mm','sheets',1700],['wpc12','WPC board 12 mm','sheets',2400],['wpc18','WPC board 18 mm','sheets',3400],
  ['screws','Screws','nos',1.5],['anchors','Anchor fasteners','nos',12],['tape','Joint tape','m',6],['compound','Jointing compound','kg',28],
  ['glass12','Toughened glass 12 mm','m²',2600],['glass10','Toughened glass 10 mm','m²',2100],['alu','Aluminium frame section','m',650],['silicone','Structural silicone','tubes',380],
  ['tile_roof','Mangalore roof tile','nos',28],['sheet_roof','Metal roof sheet','sq ft',95],['concrete','Concrete M20','m³',6500],['rebar','Steel bars (TMT)','kg',72],
  ['floortile','Vitrified tile 600 × 600 mm','nos',95],['tileglue','Tile adhesive, 20 kg','bags',420],
  ['floor_granite','Granite flooring','m²',2000],['floor_kota','Kota or Shahabad stone','m²',900],['floor_redox','Red oxide flooring','m²',450],['floor_wood','Wooden laminate','m²',1400],['floor_cement','Polished concrete','m²',700],
  ['win_upvc','uPVC window, 4 × 4 ft','nos',6900],['win_alu','Aluminium window, 4 × 4 ft','nos',5400],['win_steel','MS steel window, 4 × 4 ft','nos',4500],['win_hw','Window glass and hardware (wood)','nos',2600],
  ['mdoor_wpc','WPC main door','nos',16800],['mdoor_steel','Steel safety main door','nos',27600],['mdoor_hw','Main door hardware and lock','nos',4500],
  ['idoor_flush','Flush door shutter','nos',5500],['idoor_wpc','WPC door with frame','nos',10350],['door_hw','Door hardware','nos',1200],
  ['wood_teak','Teak wood','cft',4500],['wood_sal','Sal wood','cft',2400],['wood_honne','Honne wood','cft',2600],['wood_jack','Jackfruit wood','cft',2900],['wood_matti','Matti wood','cft',2100],['wood_pine','Treated pine','cft',1700],
  ['aggregate','Aggregate 20 mm','m³',1700],['mssec','MS sections for columns and beams','kg',74],['paint','Paint','litres',320],['putty','Wall putty','kg',22],
  ['door_main','Main door with frame','nos',24000],['door_in','Inside door with frame','nos',9000],['window','Window with frame and glass (wood)','sq ft',800],['curtain','Curtain fabric, stitched','sq ft',85],['ctrack','Curtain track','running ft',120]
];
var LABOUR=[
  ['masonry','Masonry (brick, block)','sq ft wall',22],['plaster','Plastering','sq ft face',18],['concrete','Concrete work','m³',1600],['barbend','Steel fixing (bars)','kg',8],['fabric','Fabrication and welding','kg',22],
  ['roofing','Roofing','sq ft roof',35],['tiling','Floor tiling','sq ft',30],['painting','Painting','sq ft face',12],['carpentry','Fixing doors and windows','nos',1800],['glazing','Glazing','sq ft glass',45],
  ['drywall','Dry wall fixing','sq ft wall',24],['plumbing','Plumbing','points',1200],['electrical','Electrical','points',450],['supervise','Site supervisor','months',25000]
];
var TRANSPORT=[['sand','Sand and aggregate','lorry of 5 m³'],['masonry','Bricks or blocks','lorry load'],['cement','Cement and steel','lorry of 9 t'],['finish','Tiles, glass, wood and fittings','trip']];
var DEF_RATES={
  found:{brick:200,rcc:300,ms:260},
  frame:{brick:80,rcc:360,ms:330},
  b9:140,b45:80,fa9:124,fa45:71,aac9:112,aac4:66,gypSheet:650,wpc8:1700,wpc12:2400,wpc18:3400,msKg:82,dryLab:24,truss:15000,glassW:520,glassP:380,curtain:85,ceiling:95,compound:950,plaster:34,paint:13,
  roof:{tile:300,sheet:190,rcctile:480,flat:400},
  floor:110,elec:95
};
var FIX={door:9000,main:24000,win:7500,vent:2500,kit:45000,bath:48000,wc:32000,bathwc:68000,pump:25000,site:110000,court:120,drain:15000,pillar:6500};
var RATE_FIELDS=[
  ['found.brick','Foundation, brick (₹/sq ft)'],['found.rcc','Foundation, RCC frame'],['found.ms','Foundation, MS frame'],
  ['frame.brick','Bands and lintels, brick'],['frame.rcc','RCC columns and beams'],['frame.ms','MS columns and beams'],
  ['b9','9-inch brickwork (₹/sq ft wall)'],['b45','4.5-inch brickwork'],['fa9','Fly-ash 9-inch walls'],['fa45','Fly-ash 4.5-inch walls'],['aac9','AAC 8-inch outer walls'],['aac4','AAC 4-inch inner walls'],['gypSheet','Gypsum board 12.5 mm, per 8 × 4 ft sheet'],['wpc8','WPC board 8 mm, per sheet'],['wpc12','WPC board 12 mm, per sheet'],['wpc18','WPC board 18 mm, per sheet'],['msKg','MS tube frame, per kg fabricated'],['dryLab','Dry wall fixing labour (₹/sq ft wall)'],['truss','Steel roof truss over a dry partition (each)'],['glassW','Glass outer wall, installed (₹/sq ft)'],['glassP','Glass partition, installed (₹/sq ft)'],['curtain','Full-height curtain with track (₹/sq ft)'],['ceiling','False ceiling (₹/sq ft)'],['compound','Compound wall (₹/running ft)'],['plaster','Plaster per face'],['paint','Paint per face'],
  ['roof.tile','Roof: tiles on MS (₹/sq ft)'],['roof.sheet','Roof: metal sheet'],['roof.rcctile','Roof: RCC + tiles'],['roof.flat','Roof: flat RCC slab'],
  ['floor','Flooring (₹/sq ft)'],['elec','Electrical and water supply']
];

