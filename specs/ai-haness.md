 OK, big changes coming!  We are SOOO close to having the functional protocol AI feedback loop but the experience I just had 
was instructive.  I've been THINKING that the AI features for computable-lab should be handled a bit more like an agent chat 
(like we're having right now).  Then I just tried to localize step 1: Grow cells to sub-confluency or prepare cell suspensions 
at 104–106 cells/mL in.  My prompt was: Add a t25 flask to the deck with 10,000 HepG2 cells and 25mls of DMEM plus 10% FBS.    
The AI added a 24 well plate to the deck.  I messaged back something like: I think we have a T25 flask in the library, we 
typically grow cells in t25 flasks, can you put a t25 flask on the deck instead of a 24 well plate.    I hit revise and the 
AI put the 24-well plate back on the deck.  Teachable moment: I don't know WHY the AI didn't get my prompt right.  Maybe I'm 
confused, maybe we don't HAVE a T25 plate in this repo, maybe it was just generally confused.  But I don't know because AI is 
inherently conversational and we haven't built an agent conversation (yet).  In the last days I've been trending this way: make 
every context declaratrive so that an AI could emit a declarative statement that could be used to rebuild the context of the 
editing surface.  One of the reasons this app development has slowed down is that we're trying to re-create all of these ticky 
tacky ald school app features: add a button and a menu here, a checkbox there, a modal here.  I think things would move a lot 
quicker if we realized what we were building: an agent harness for biology grounded in 1) the language of the computable-lab 
schemas, 2) the visualization of the event editor - biologists van use the mouseover events to inspect the well contents and 
contexts and to "see" the experiment, 3) the deterministic compiler - biologists wouldn't trust a pure AI harness but the fact 
that the AI has to emit events that compile through the compiler keeps things deterministic and auditable, 4) yaml-record based.  
Again: inherently auditable, understandable by humans and if everything else dissapeared you could reconstruct the whole system 
from the yaml records.   Key concepts:  1) The main pane (left) can be navigated by the AI, perhaps by emitting a Jump button 
in the AI chat, 2) the right hand pane will be replaced with a permanent chat window that is large enough that the user can 
scroll back through the convo, 3) and this is HUGE: we can switch the CONTEXT of the AI chat.  This replaces UI buttons and 
menus and blah blah.  This is actually DONE (sort of, haha!).  RIGHT NOW, in  the protocol pane of the event editor, in the 
top it says: EDITING: Step 1.    !!!!!!!!     I'm NOT saying I want to tear the whole thing down.  Ugh, I really didn't want 
to go there, but maybe a 3 pane layout is in order.  The middle pane has the action: the event graph visualization, the PDF 
protocol extractor (although I quite like the full page PDF extrator look with the back arrow to the app that we have now, so 
let's leave that alone).  Here it is:  Left hand pane - navigation, this is the tabbed view that has the project or run 
artifact breadcrumbs, the protocol steps, etc.  Middle pane: the action - event editor, TapTab editor, etc.  Right Pane: 
permanent AI chat that drives the whole thing.  The top section is a small panel that sets the context - what are we working 
on right now (answer: step 1 ) The botton 2/3 or 3/4 of the right hand pane is the AI chat which should be generously spaced 
because these chats get wordy!



Continue to edit the plan, I don't think we're close to ready to implement yet.  Explain to me how our current plan works to edit
the protocol steps.  The protocol is in the left hand pane.  When I click a step it gets sent to the AI chat and renders in the top
right panel as the context?   When I type a prompt top the AI it can choose to simply answer me in the chatr as we're doing now or
issue an update to the Step 1 event graph?  Think through the whole lifecycle of this kind of edit.  After the chat updates a step,
I want to see those events ghosted in the center window.  Is there a backend API that the chat AI is emitting calls to (via MCP?)
to send the events, update the central and left panels?  Let's just riff on this or a bit.

 Let's take a step back and imagine what is the POINT of this thing.  The biologist walks into the lab in the morning, wants to
get shit done.  They're still somewhat distrustful of AI, but they're used to having to track shit in their notebooks.  I started
this project with the idea that many biologists would prefer to have a traditional UI instead of driving the whole thing with AI,
but I'll admit that the free-form nature with which AI allows us to just design an experiment is enticing.  At the SAME time, AI
sort of sucks at drawing plate maps.  Blah blah, I just stepped WAY back.  But this is a KEY moment in this project and let's keep
riffing.  Biologists inherently trust protocols, steps, details.  This is where the event graph is crucial but they are maybe used
to drawing out their experiences with a pen in their lab notebook.  They don't want pure AI and everyone hates vendor software
where you constantly hunt throuigh menus and icons for the exact correct sequence of events to actuallt launch a GC-FID read.  I'm
proposing a middle ground solution, and maybe we've already implemented it and I'm just dumb.  I think the proposal I'm making goes
something like: the chat window is the place you go to make things happen, every surface can be conjured with a deterministic
utteration from the AI ( I GET that I'm just re-describing what an API is is along-winded way...)  BUT for each convo the biologist
can really dig into the deterministic compiler and the plate and bench viewer and really dig in and see the dilutions because they
are CONSUMED by details and they can't read code.   So like: the chat window runs the app, determines what they're looking at.
"pull up our cell protocol for HepaRG cells".  "Let me see yesterday's run".  "No, I want the data analysis, not the plate layout".
"What's the average increase in SCD1 expression when we've introduced 1uM clofibrate to HepG2 cells over the last three momnths".
"In step 3 o the HepaRG protocol, we have decided that it's better to seed 2 T25 plates with 100,000 cells each than a single T75
with 300,000 cells".  I think what I'm asking is that this project becomes an agent harness for biology with locally run agents
(labs don't want theior data sent to AI companies - I am basing this whole thing to run on qwen 35B A3B).  But CRUCIALLY: the
compiler is declarative, the AI is never just running freeform, the biologist can always highlight a topic with the AI: NOW we're
digging into this littel aspect of our protocol, our data analsysi, whatever.  The biologist wants the abilty with a click to
confine the context of the AI and the appreciates that sop it knows to emit a small event graph for step 3 o the HepRG
drug-sreening protocol rather than simply be unleashed in the repo.
