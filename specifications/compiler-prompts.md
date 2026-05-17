## Compiler Prompts

### Overview

This is a list of prompts that the deterministioc pre-compiler/compiler pipeline should be able to handle gracefully and the expected result.

#### Experiment 1 :  Simple FIRE Assay

**NOTE:**  This is intended for the Integra Assist deck setup.

1. Place a 96 well TC-coated plate on deck slot D with 100,000 HepG2 cells/well and 200uL DMEM.

Any biologist will just expect this seemingly simple but actually quite difficult prompt to "just work".  In reality, the difficult parts are mapping the materials to a) locally saved terms or b) ontology terms or c) created the local terms if they don't exist.  Of course these need to follow the material/nmaterial-formulation/material-instance schema.  The other curveball is TC-coated 96-well plate.  An example of these is corning CLS3997 but there are hundreds of variations.  In fact, plates can differ by: structural material (polypropylene vs polystyrene), color (black, white, clear), bottom material (same as the rest of the plate versus imaging film).  This gets into vendor materials, but we should also make sure the plate schema can handle this level of complexity/reality.  We should also be able to model the plates geometry equivalent to a an opentraons labware definition.  


2. Place a 12-well SBS format reservoir on slot C with different media.  Well 1 has 4ml of DMEM 1X glucose, 1X BCAA; well 2 has 9same volume) DMEM 1X glucose, 2X BCAA; well 3 has 2X glucose, 1X BCAA; well 4 has 2X glucose, 2X BCAA; well 5 has 4X gluose, 1X BCAA; well 6 has 4X glucose, 2X BCAA; well 7 has 100uL 1mM clofibrate in DMSO; well 8 has 20X resazurin in DMEM.

Again, this goes at the heart of material resolution and labwares, with a bit of inexactitude using 1X, 2X, 4X versus 1mM, 2mM, 4mM.  Additionally, you have to assume that the volume in wells 1-6 remains the same until explicity changed in 7.  These additions will be made with add material rather than transfer.

3. Using an 8-channel, 300uL pipette, aspirate the media from the plate in D2 and dispence intol the waste.  Replace the media with duplicates based on wells 1-6 in the 12 well reservoir.  So columns 1-2 get media from reservoir well 1, 3-4 get media from well 2, etc.

Just a basic media swap with duplicate wells, but you have to resolve the labware-instances, wells-to-columns, etc.  These will be transfers.  What will be done with the pipettes is left implicit by the user but the default should be to eject them into the trash unless explicitly stated otherwise.  Also left implicit by the user is that 300uL tips need to be added to the tip area in landscape mode.

4. Rotate the plate in D and the reservoir in C to portrait mode, replace the 300uL tips with 125uL tips in portrait mode and swap to a 12-channel adjustable-spacing 125uL pipette.

5. We are going to do a 4:1 serial dilution down the columns in the target plate (D) so we need to increase the volumes in row by 25uL.  Collapse the pipette to 4.5mm spacing so that each tip grabs 20uL from rows 1-6 of the twelve well reservoir (tips 1-2 will draw from well 1, tips 3-4 from well 2, etc).  The expand the tips top 9mm spacing and dispense into rows 1-12 of column a of the target labware.

grab = aspirate
adjustable distance pipettes.  
concept of serial dilution (whay are we doing this?) but no serial dilution yet.

6. Put the 12 well reservoir back into landscape mode, change tips to 4.5mm spacing and aspirate 5uL from well 7.

7. Now we perform the serial dilution.  Expand the tips to 9mm, dispense into row one of the target plate.  Do a pipette mix (5 cycles, 125 uL).  Transfer 25 ul to the next row, repeat the pipette mix.  Continue the serial dilution all of the way down.  Aspirate 25uL from the final row and dispense of the tips into the trash.

8.  Incubate plate at 37C, 5% CO2 for 2 hours.

9. Put the plate back on slot D in landscape, transfer 10uL of resazurin to row 1, do a pipette mix, drop tips.  Repeat this for each of rows B-H.

User here assumes that the machine already understands how to collapse tip spacing to aspirate and expand to dispense because they just did it in steps 6-7.
