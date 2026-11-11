/* Room for Everyone: measurements baked from the 3D model, with the tools in room.js (ROOM3D.dev).
   stand: where you stand in each room (pos, eye height five feet), what you face when you arrive, and where a game piece stands.
     Each was picked from dev.stand(), which ray-casts a grid of the room at shin and chest height, keeps the clearest spots and
     throws out any that are not on open floor (a spot on a bed once read as clear). You stand where somebody would on walking
     in, a step or two inside the door, with the windows ahead and the bed in front of you, not under you. In a room with a
     skylight up a well you stand within about two feet of being under one, or its glass cannot be seen at all.
   sun: for every window, glass door and skylight of a room, how much of the sun reaches it on 21 June, half-hourly from 7:00 to
     19:30, as a digit 0 to 9 (ninths of nine rays cast from the glass toward the sun through the model's trees, eaves, hills and
     neighbours; for a skylight the ray must also get down its well into the room). Made by dev.sunScan(). */
window.ROOM_DATA = {
  stand: {
    primary: {pos: [-11.6, 10.57, -28.3], face: [-18.8, 9.3, -37.5], pawn: [-15.2, -38.2]},
    loft:    {pos: [-20.5, 10.57, -11.05], face: [-19.9, 11.5, -2.5], pawn: [-22, -5.6]},
    garden:  {pos: [22.71, 5, 3.27], face: [21.8, 4.6, -6.7], pawn: [18.51, -3.73]},
    middle:  {pos: [23.8, 5, 18.12], face: [32.3, 4.4, 19], pawn: [29.5, 16.5]},
    front:   {pos: [19.3, 5, 33.4], face: [25.5, 4.4, 36.2], pawn: [27.4, 31.2]},
    corner:  {pos: [-18.17, .44, -39.82], face: [-16.4, -.2, -49.9], pawn: [-20.97, -45.42]},
    side:    {pos: [-25.65, .44, -28.74], face: [-27.6, -.2, -40], pawn: [-22.85, -35.74]},
    office:  {pos: [-26.5, .44, -8.9], face: [-29.8, .2, -3.6], pawn: [-28.11, -5.18]},
    lounge:  {pos: [-17.25, .44, -21.4], face: [-10.5, -.4, -18.9], pawn: [-13.05, -18.6]},
    garage:  {pos: [-17.2, 1.66, 5.76], face: [-24, .4, 16.5], pawn: [-17.2, 14.56], pawnYaw: 1.5708}},
  sun: {
    primary: [{id: 'D-L2-01', lit: '00000000000000008992000476'}, {id: 'WN-L2-01', lit: '00000000000000003100000005'}, {id: 'WN-L2-02', lit: '00000000000000003300000000'}, {id: 'WN-L2-05', lit: '00000100000000000000000000'},
      {id: 'WN-L2-08', lit: '00000000000000001122100005'}, {id: 'WN-L2-09', lit: '00000000000000003469941499'},
      {sk: 'SK-R07', lit: '00000000046699999966400000'}, {sk: 'SK-R08', lit: '00000000005699999966620000'}, {sk: 'SK-R09', lit: '00000000000049666420000000'}, {sk: 'SK-R10', lit: '00000000000000256420000000'}],
    loft:    [{id: 'WN-L2-06', lit: '00000000000000033666610000'}, {id: 'WN-L2-07', lit: '00000000999840000000000000'}, {id: 'WN-L2-10', lit: '20000004333333000000000000'}, {id: 'WN-L2-11', lit: '54000031543111000000000000'}],
    garden:  [{id: 'WN-L1-06', lit: '00000000000000002000000000'}],
    middle:  [{id: 'WN-L1-08', lit: '99999966300000000000000000'}],
    front:   [{id: 'WN-L1-05', lit: '90900089999930000000000000'}, {id: 'WN-L1-07', lit: '99910099999981000000000000'}],
    corner:  [{id: 'WN-L0-03', lit: '00000000000000000101899996'}, {id: 'WN-L0-06', lit: '30000011000000000000000000'}],
    side:    [{id: 'WN-L0-07', lit: '00000000000000000000005999'}, {sk: 'SK-R05', lit: '00000000013666600000000000'}, {sk: 'SK-R06', lit: '00000000000666600000000000'}],
    office:  [{id: 'WN-L0-08', lit: '00000000000003669600000000'}, {id: 'WN-L0-09', lit: '00000000089981000000000000'}, {sk: 'SK-R11', lit: '00000000029999699620000000'}, {sk: 'SK-R12', lit: '00000000029999699640000000'}],
    lounge:  [{id: 'D-L0-10', lit: '00004342200000000000000000'}],
    garage:  [{id: 'WN-L0-02', lit: '00000000000000036666200000'}, {id: 'WN-LG-01', lit: '00900000000000000000000000'}]}};
