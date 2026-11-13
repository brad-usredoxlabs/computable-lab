## Noun Creation within the AI loop

###  Journey: Add a noun within a chat in the UI panel.

Context:  The user has a 96-well plate on the deck and selected and they have selected wella A2-H5 of that plate.
User prompt: Add 100uL of DMEM to each well.  (DMEM is not yet a locally saved term in this scenario)
AI Response:  DMEM is not a local term, would you like to add it? 
    Button 1: Add from a vendor or ontology
    Button 2: Local formulation
    Button 3: Local Product/Sample

####  If User Action: Click Button 1

Action:  User clicks Button 1.
AI response: navigates the main pane to material ingestion with DMEM pre-filled into the search
Action: User peruses the search results, likely picking a Sigma Product or Thermo product (they should be presented with both vendor and ontology hits)
Expectation: The results are compact but show a detailed view for the tooltip
    Action Option 1: When user clicks a vendor product result they are taken to the labware/material/equipment ingestion page appropriate to the noun
        Action: User goes through the ingestion operation, collecting automated details like catalog number, unit size, manufacturer, SDS sheet is stored in the lab NAS and a link is created usibng the pre-built library we have for this 
        Action: when user is satisfied with product ingestion they click "accept"
        Action: User is taken to the ontology connector screen to match ontology roles with terms.  (There is an old popup modal for materials where it's like, HepG2 is_a CLO:HepG2; HepG2 is_organism NCBI:H sapiens; HepG2 is_organ Uberon:liver)
        Action: user clicks "accept" and they are returned to the original jumping off point: in the event editor with the conditional satisfied for their original prompt and the workflow continues.
    Action Option 2: When user clicks an ontology term they are taken to the ontology connector screen and complete the workflow from there.  
            This is because there is a 500ml bottle of DMEM in the firdge labelled only with marker on masking tab, the lab had previous orders from both Thermo and Sigma, the provenance is unclear.  It's still DMEM ( NCIT:C185409 )

#### If User Action: Click Button 2 (Local Formulation)
WHY: Labs can save money by buying powdered DMEM and mixing it with water and phenol red or even by buying all of the components individually, weighing them out and mixing them altogether.  
AI Response: Navigate to the formulation create/Edit page
Action: Fills in the form (name, line items of component x quantity, total amount produced, synonyms) and hits save (creates concept)
Action: User is taken to the ontology linking page 
Action: User is taken to the create inventory page to attest to the amounts in inventory
Action: User hits accept and is returned to the jumping off propmt with the new product as inventory inserted into the originla prompt

####  If user Action: Click Button 3
WHY: DMEM is a bad example for this, but maybe the lab has a regular kitchen spatula of unknown provenance used for a specific task that they call "MVP".  Even more relevant for samples - Urine sample A, pondwater sample B123.
AI response: Navigate to the creation pane per material type.  I can imagine us building a very sophisticated system for scanning in samples and connecting them to labwares, etc.  If its an equipment they should just be sent to the new equipment TapTab surface.
Action:  User completes the workflow, clicks Accept and is returned to the event editor where the item now exists.


