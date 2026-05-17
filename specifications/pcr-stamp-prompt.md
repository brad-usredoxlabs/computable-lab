## PCR Stamp Propmt

### Overview

This is a simple protocol we run on the opentrons Fklex.  It could just as easily be run on an OT-2.

### Protocol steps


1. [The biologist uploads a .csv file of sample ids.]  Place a 96-well PCR plate loaded eith samples on deck position D2.

The samples should be added to the plate with add_material.  The user doesn't specify concentration or if this is DNA or cDNA.  SHould we prompt them?

2. Put a 12-well reservoir with a master mix including primers and probes loaded into slot 1 on deck position B2.

slot = well, 1 = A1
User doesn't specify volume, it'll need to be determined by the compiler, always a good idea to add 10% overrun to a source well.

3.  Place three 384 well PCR plates on deck slots C1-C3

4. We are going to stamp out the samples in triplicate into each of the three PCR plates using the 8-channel, 1000uL pipette (5uL minimum volume).  If we are talking about A1 in the 96-well sample plate, this maps to wells A1, A2 and B1 in the target 384-well plate.  We will start with the Master Mix, this can be broadcast across all 108 wells serviced by each pipette tip in a multi-dispense.  

5. Now stamp out the samples, using a 5uL multi-dispense corresponding to each of the 3 wells in each 384 well plates that map to the 96 well plate, 9 wells total per pipette tip.

