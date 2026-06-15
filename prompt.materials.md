/plan Deep dive on materials.  We have materials as concepts, formulations and instances.  The concepts can have things like molecular weight and roles (agonist of PPARa).
  The formulation can have a recipe (10mg of fenobrate in 1ml of DMSO makes 1mM fenofibrate in DMSO).  The instance can have a creation date, a lot number, etc.  When we Add
  Material, we want to make this convenient for the biologist (ie not feel like ERP).  They can say "add 10uL of 1uM fenofibrate to well A1 with role PPARa agonist".  Of
  course this touches every level of a material definition.  Material is showing up all over computable-lab in different confusing ways.  And there are different types of
  materials.  At THIS moment, I'm mostly concerned with three types: cells (HepG2), single chemical formulations(1uM fenofibrate in DMSO), composition materials(DMEM with 10&
  FBS).  We HAVE logic for how each of these types should be requesting information from the user if they use the pathway of: select wells in the event-editor using the UI and
  select "Add Material" from the context menu.  However, even THIS falls down because the modal 1) doesn't have an input for volume, 2) when you click save, it says, "can't
  save without a role" yet the modal doesn't allow you to put in a role.  The material issue is at the core of making computable-lab work.  What does it mean to be a chemical,
  what is its role?  What tissue type and organism is that cell line from?  Without encoding this information into the graph, it's more difficult for AIs to reason about it.
  I think, although I'm happy to hear alternate options, that we should get one editing surface for materials correct in TapTab and then re-use it.  Right now TapTab records
  look pretty good but the fields are uncontrolled.  The fields like provenance should be auto-filled by the application.  Fields that reference ontology controlled terms should be auto-set to launched the slash menus instead of simply allowing free text.

A big current problem is that "Add Material" is simply allowing bare ontology terms.  Bare ontology terms should NEVER be used, instead a local CURIE should be minted that references the proper ontology term.  This USED to be implemented before we redid the surfaces in the two panel view.  The logic exists for adding materials that I THINK become lightweight material instances referencing a formulation.  We need a global strategy to take care of the inconsitencies we are seeing in handling materials across the application.  

If the correct surface to control this on is TapTab, then we also need to apply these fixes to ALL record types in TapTab.  The schemas should specify which fields are autofilled by the application (ie provenance), which fields are ontology controlled and which fields are truly chosen free text by the user (Project Name).
