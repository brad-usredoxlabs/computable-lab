### Corpus 2 For the AI loop.

This is a workflow.  These propmts are meant to follow one another being part of a single experimental setup.  Do not clear context between prompts.

EVERYTHING in this series of prompts should have SIGNIFICANT code underpinning it in the repo, EVEN the idea that the HepG2 cells growth will be modelled following the algorithm.  This exercise should just be stitching together components that already exist.

 Note: these percentages are the arithmetic consequence of the stated quench mixture and the 100 µL of
      plain DMEM already in the well. They are not a claim that the mixture is a viable culture condition —
      8.6% residual trypsin is high. Culture medium is introduced where the protocol introduces it.

## When something isn't in the system yet

Anywhere below where I name something - a plate type, a material, a cell line, equipment, a protocol - and the system doesn't already have it: don't tell me the word is unknown and stop.  Do it in this order: 1) create the type, 2) create an instance of the type, 3) carry on with the prompt I actually typed.  A new plate type gets created and then a plate of that type goes on the deck.  A new material gets its concept created and then the vendor product that points at it.

If the thing exists in an ontology, anchor the new record to that term and show me the namespace and the full label, so I can see I'm picking the right one.  If nothing fits, create it anyway and record it as unanchored with the reason showing - I'd rather see "unanchored" than have it look finished.

Two things not to do: don't pick a near miss for me (DMEM is not DMEM/F-12), and don't invent a catalogue number - ask me for it.

## Prompt 1

Surface: Event Editor
Bench: Single SBS plate manual
Prompt:  Place a 96-well plate on the deck.
Expectation: It uses the generic 96-well plate the lab already has in its library and puts a plate of that type on the deck.
Expectation: The plate on the deck is backed by a record: I can see which labware definition it used, and it is the generic 96-well plate rather than something invented, re-shaped or re-formatted.
Expectation: I can see visually that a 96-well plate has been added to the deck.

## Prompt 1b

Surface: Event Editor
Bench: Single SBS plate manual
Prompt:  Place a Thermo Optical-Quality Imaging Plate, 384-well, black-walled, clear bottom (catalog number A58941) on the deck.
Activity:  Neither that plate type nor the Thermo A58941 product is in the system yet. This is a vendor product, not a generic shape: identify the type it is, create the type anchored to the labware ontology if there's a term for it, then create the Thermo product pointing at that type with its real catalogue number.
Expectation: It asks me to create the type, anchored to the labware ontology if there's a term for it, and then puts a plate of that new type on the deck.
Expectation: It records the Thermo A58941 product against the type it created, using the catalogue number I gave it and inventing nothing.
Expectation: I can see visually that a 384-well plate has been added to the deck.

## Prompt 2

Activity:  Select a range of wells (A2-H5) (using the mouse you have to select A2 then shift-click H5)
Expectation:  Tyhe range of selected wells is highlighted in yellow.
Prompt: Add 100 ul of DMEM
Activity:  DMEM isn't stocked yet, so create it first: the material concept anchored to the DMEM ontology term, then the Sigma D6429-500ML vendor product that points at it.  Then pick that vendor product.
Activity:  Select the Sigma DMEM from the clarifier, that's a vendor pruct, fine here.
Acivity: Wait for LLM.
Expectation: Shorthand prompt is returned specifying the newly minted vendor term and the well selections.  At this point, the highlighted wells should display a tooltip with the 100ul of DMEM highlighted.
Acitivty:  Accept the proposal.
Activity:  A mouseover of the selected wells should now display "100 uL DMEM"

## Prompt 2a

Context:  This is a continuation of prompt 2, we are iteratively building an experiment.
Prompt:  Add 1uL of 1mM clofibrate in DMSO to wells E2-H5.
Activity:  Optionally, if there is no 1mM clofibrate material we specify what to mint.
Activity:  If clofibrate itself isn't in the system, create the concept anchored to its chemistry ontology term first, then the 1mM in DMSO formulation against that concept.
Expectation: The events will come back from the LLM turn with the 1mM clofibrate ghosted into the wells.  Mouseover of a well will show the final concentration of clofibrate as well as the components.
Activity: Click on well A1 to select IT.
Expectation:  Wells A2-D5 will be a single color block.  Mousing over them will show the 100ul of DMEM only.
Expectation:  Wells E2-H5 will be a single color block of a DIFFERENT color.  Mousing over them will show the tooltip with 100ul of DMEM (~99%) plus 1ul of DMSO (~0.9%) and the final concentration of clofibrate.

## Prompt 3

Goals:  Testing an item (cells) measured in units rather than volume.  Also, cells are adherent so the media can be removed and replaced but the cells remain.
Context:  Cells are released from their flasks using an enzyme called trypsin-EDTA, a proteinase with a chelator, this is a vendor product.  The trypsin reaction hurts the cells and so we quench it using a mixture that is 90% DMEM and 10% FGBS (Fetal Bovine Serum). 
Context: The cell culture protocol follows: "Cell Seeding Protocol".
Activity: Add the cell seeding protocol to the list of protocols followed in this run.  That protocol produces a parameter:  cells/ul.  we will assume for these purposes that cells/ul is 483.
Prompt:  Add 10,000 HepG2 cells to wells A2-H5
Activity:  HepG2 isn't in the system yet - create the cell line material anchored to its cell line ontology term, then use it here.
Activity:  Trypsin-EDTA, DMEM and FBS are all vendor products.  If any of them is missing, create the concept first (anchored where an ontology term exists) and then the vendor product with the real catalogue number: Thermo 25200056 for the trypsin-EDTA, Sigma D6429-500ML for the DMEM, Sigma F4135-100ML for the FBS.
Expectation: The next add material will be 20.7 ul of the 50:50 mix of (Trypsin-EDTA):(90% DMEM) + (10% FBS) containing 483 cells/ul.
Activity: accept.
Expectation:  Upon mouseover of any well (that is in A2-H5), the tooltip will show the 10,000 HepG2 cells and the final concentrations of DMEM, Trypsin-EDTA, FBS  (~90.6%, ~8.6%, ~0.9%).  The wells E2-H5 will also show ~0.7% DMSO.

## Prompt 3a

Prompt: Incubate the cells for 24 hours in the 37 degree, 5% CO2 incubator.
Expectation: The incubation event will be added to the plates event graph.  There will be an obvious visual representation of plate events in the timeline (incubate, shake, vortex)

## Prompt 4

Prompt: Aspirate the media from the wells.  Wash 2X with PBS.
Expectation:  The two PBS washes are added to the timeline.  The wells are now empty except for the HepG2 cells which have now grown in number over the 24 hours based on an assumed doubling time of 30 hours.

## Prompt 5

prompt: Take us to protocol ingestion
Expectation: the main pane navigates to  the protocol ingenstion tab: http://computable:5193/ingestion
Activity: Do an Exa search for "Nile Red Neutral Lipids Mammalian Adherent Cells".  Choose "Red Fluorometric Lipid Droplet Assay Kit" from abexbt.com
Expectation: Despite weeks of work on protocol ingestion, this part of the app is 100 borked.  I THINK from this screen we should choose "Build Protocol" (probably delete the other links). From THAT link we should choose "Extrcat Candidate".  
Expectation:  The decision tree will be adherent versus suspension cells and live cells versus fixed cells.
Activity: Select adherent cells and live cells.  Click "Draft Semantic Protocol".
Expectation: The ingestor will correctly pull out a concise protcocol with materials, equipment and a list of steps that includes only parts relevant to adherent live cells.

## Prompt 6

Prompt:  Attach the protocol to the run and return us to the event editor.
Expectation: The newly ingested protocol is added to the list of protocols follwed in the run and becomes the active selected protocol that is displayed in the left hand pane.

## Prompt 7 

Prompt: Add the proper amount of Nile Red solution and Hoescht from the protocol to 10mls of Invitrogen Live Cell Imaging Solution.  The Live Cell Imaging Solution replaces the "Assay Buffer" in the protocol.  Add the 10mls of solution to a single channel 25ml reservoir,  Use the 8-channel pipette to transfer 100ul of the pre-mixed stain to each well (A2-H5).
Expectation: Wells A2-H5 now contain 10,000 HepG2 cells * their growth rate calculated over the 24 hours with 100ul of 99.8% Invitrogen Live Cell Imaging Solution, 0.1% Nile Red Reagent (vendor product from APExBIO) and 0.1% Hoescht-xxxx (vendor Product from APExBIO)
Activity: If a 25ml single channel reservoir isn't a labware type in the system yet, create it - one well, wide enough and deep enough that the whole 8-channel head fits inside it, which at 9mm tip spacing means at least 63mm across - then add an instance to the deck.
Activity: If the Nile Red and Hoescht aren't in the system, create the material concepts (anchored to their ontology terms where they exist) and then the APExBIO vendor products with the real catalogue numbers.

## Prompt 8 

Prompt: I have just dropped the fluorescence images into the NAS, take us to the image analysis for this run.  
Expectation: The raw data files will be linked to the protocol, we will build an image analysis layer using Napari. 

### Cell Seeding protocol:
**Materials:**
1. T25 vial of growing cells
2. Trypsin-EDTA
3. DMEM with 10% FBS

**Steps:**
1. Warm the Trypsin-EDTA and DMEM with 10% FBS to 37C in a water bath
2. When warm, remove the T25 flask from the 37 degree, 5% CO2 incubator
3. Aspirate off cell medium and discard
4. Add 2ml of trypsin-EDTA
5. Incubate 2 minutes in 37 degree incubator
6. Quench reaction by adding 2 mls of DMEM with 10% FBS
7. Use a hemocytometer to count the cells per ul 
