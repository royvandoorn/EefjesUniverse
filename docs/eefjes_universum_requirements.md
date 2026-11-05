# Eefje's universum --- Product Requirements Document

**Document version:** 1.0\
**Status:** Draft for review\
**Project type:** Personal, private web application\
**Primary user:** Eefje\
**Purpose:** Sinterklaas gift and ongoing personal digital notice board\
**Last updated:** 3 November 2026

------------------------------------------------------------------------

## 1. Product overview

### 1.1 Product vision

**Eefje's universum** is a private, personal, interactive digital notice
board. It gives Eefje one large, free-form canvas where she can collect
and arrange thoughts, photographs, and lists.

The experience should feel like a personal scrapbook or a little corner
of the internet---not like a conventional productivity or
project-management application.

Eefje should be able to use it for simple everyday notes, pictures she
wants to keep, lists she wants to maintain, and small pieces of her life
she wants to collect in one place.

### 1.2 Product goals

1.  Give Eefje a beautiful, personal space she can continue using after
    receiving it as a gift.
2.  Make adding and managing content straightforward, without technical
    knowledge.
3.  Make the board visually expressive through a free-form canvas and
    visual groupings.
4.  Keep the website private and access-controlled.
5.  Keep development effort and ongoing costs low.
6.  Make the website usable on both desktop and mobile devices.

### 1.3 Out of scope / product principles

The first version is not intended to become a full productivity suite,
social network, collaborative workspace, or complex journaling platform.

The product should prioritize: - A delightful and personal visual
experience. - Simple content creation. - Reliable saving and storage. -
A small, maintainable feature set.

------------------------------------------------------------------------

## 2. Target users and permissions

### 2.1 User roles

The initial product has two access levels:

  -----------------------------------------------------------------------
  Role                    Intended user           Permissions
  ----------------------- ----------------------- -----------------------
  Viewer                  People Eefje chooses to View the board and its
                          share the viewing       content; no changes
                          password with           

  Editor                  Eefje                   View, create, edit,
                                                  move, resize, and
                                                  delete board content
  -----------------------------------------------------------------------

There is no requirement for individual visitor accounts or multiple
named users in the MVP.

### 2.2 Access model

The selected access model uses **two separate passwords**:

-   **Viewing password:** Eefje can share this with people she wants to
    let view her board.
-   **Editing password:** Eefje keeps this private. It grants editing
    permissions.

The website opens directly on the board after the visitor has
successfully authenticated. The application must determine the visitor's
permission level and present the appropriate experience.

**Important security implication:** Anyone who receives the editing
password can edit the board. The editing password must therefore be
shared only with Eefje. Anyone with the viewing password can see the
board's contents, so Eefje should understand that sharing it gives
access to her personal content.

### 2.3 Security requirements

  -----------------------------------------------------------------------
  ID                      Requirement             Priority
  ----------------------- ----------------------- -----------------------
  SEC-01                  The website must        Must
                          require authentication  
                          before displaying board 
                          content.                

  SEC-02                  The application must    Must
                          support separate        
                          viewing and editing     
                          passwords.              

  SEC-03                  A valid viewing         Must
                          password must grant     
                          read-only access.       

  SEC-04                  A valid editing         Must
                          password must grant     
                          read and write access.  

  SEC-05                  Viewers must not be     Must
                          able to create, edit,   
                          move, resize, or delete 
                          content.                

  SEC-06                  Write operations must   Must
                          be authorized on the    
                          server/backend, not     
                          only hidden in the      
                          frontend.               

  SEC-07                  Passwords must never be Must
                          stored in plaintext;    
                          store secure password   
                          hashes or use a         
                          suitable managed        
                          authentication          
                          mechanism.              

  SEC-08                  Authenticated sessions  Must
                          must be handled         
                          securely, using secure, 
                          HTTP-only cookies where 
                          supported.              

  SEC-09                  The application must    Should
                          protect against         
                          repeated password       
                          guessing with rate      
                          limiting or an          
                          equivalent safeguard.   

  SEC-10                  The owner must be able  Should
                          to change or rotate     
                          both passwords through  
                          a documented            
                          administrative process. 

  SEC-11                  Passwords and session   Must
                          credentials must not be 
                          exposed in page source, 
                          client-side             
                          configuration, logs, or 
                          URLs.                   

  SEC-12                  The application must    Must
                          prevent unauthorized    
                          direct access to stored 
                          images and data,        
                          consistent with the     
                          selected viewing        
                          permissions.            
  -----------------------------------------------------------------------

**Implementation note:** A shared password is a simple access model, not
individual identity verification. It cannot establish which specific
person is viewing or editing. Individual accountability or revocation
per person is not necessary.

------------------------------------------------------------------------

## 3. Website availability and privacy

  -----------------------------------------------------------------------
  ID                      Requirement             Priority
  ----------------------- ----------------------- -----------------------
  WEB-01                  The website must be     Must
                          hosted at a stable URL. 

  WEB-02                  The URL may be a random Must
                          or non-obvious          
                          subdomain/path; a       
                          custom domain is not    
                          required.               

  WEB-03                  The website must not be Must
                          publicly discoverable   
                          through search engines. 

  WEB-04                  Search engine indexing  Must
                          must be discouraged     
                          using `noindex`         
                          directives and an       
                          appropriate robots      
                          policy.                 

  WEB-05                  Authentication must     Must
                          protect the actual      
                          content and backend     
                          resources; an unlisted  
                          URL or `noindex` alone  
                          is not sufficient       
                          privacy protection.     

  WEB-06                  The site must use       Must
                          HTTPS.                  

  WEB-07                  The website should use  Should
                          a free or low-cost      
                          hosting option where    
                          practical.              

  WEB-08                  The application should  Should
                          not require a paid      
                          custom domain.          
  -----------------------------------------------------------------------

The site is private in the sense that content is behind password
authentication. It is not intended to be a publicly browsable website.

------------------------------------------------------------------------

## 4. Main user experience and navigation

### 4.1 Landing experience

After successful password entry, the user should land **directly on the
main canvas**. There should be no separate welcome page or dashboard in
the MVP.

### 4.2 Main screen

The main screen consists primarily of: - A large free-form canvas. -
Existing notes, pictures, and lists placed on the canvas. - A simple way
for Eefje to add new content. - Lightweight controls for managing
content. - Optional visual labels or groupings to help organize the
board.

The interface should avoid unnecessary menus and application chrome. The
board itself should be the focus.

### 4.3 Responsive behaviour

  -----------------------------------------------------------------------
  ID                      Requirement             Priority
  ----------------------- ----------------------- -----------------------
  UX-01                   The application must    Must
                          support modern desktop  
                          browsers.               

  UX-02                   The application must    Must
                          support modern mobile   
                          browsers.               

  UX-03                   The board must be       Must
                          usable with mouse,      
                          touch, and common       
                          mobile gestures where   
                          applicable.             

  UX-04                   Text and controls must  Must
                          remain readable and     
                          usable on small         
                          screens.                

  UX-05                   Content must remain     Must
                          accessible when the     
                          canvas is viewed on a   
                          smaller screen.         

  UX-06                   The application should  Should
                          load quickly on         
                          ordinary home and       
                          mobile connections.     

  UX-07                   The interface should be Must
                          understandable without  
                          instructions or         
                          technical knowledge.    
  -----------------------------------------------------------------------

------------------------------------------------------------------------

## 5. Canvas requirements

### 5.1 Canvas concept

The application uses **one main, free-form canvas**. Notes, photographs,
and lists are independent elements that can be placed at different
positions.

The canvas should resemble a digital scrapbook, mood board, or physical
notice board.

The MVP should use a large virtual HTML canvas with independently
positioned elements. It does not need to be an infinite drawing surface
or a graphics-editor-style application.

### 5.2 Canvas functionality

  -----------------------------------------------------------------------
  ID                      Requirement             Priority
  ----------------------- ----------------------- -----------------------
  CAN-01                  The application must    Must
                          provide one main        
                          free-form canvas.       

  CAN-02                  Notes, pictures, and    Must
                          lists must be           
                          independently           
                          positioned on the       
                          canvas.                 

  CAN-03                  Eefje must be able to   Must
                          move elements using     
                          drag-and-drop.          

  CAN-04                  The canvas must support Must
                          scrolling to reach      
                          content outside the     
                          visible viewport.       

  CAN-05                  Element positions must  Must
                          persist after saving    
                          and reloading the page. 

  CAN-06                  New elements should be  Should
                          placed automatically in 
                          a reasonable available  
                          position.               

  CAN-07                  Elements may overlap    Should
                          where the visual design 
                          allows it.              

  CAN-08                  Eefje should be able to Should
                          resize elements.        

  CAN-09                  Eefje may be able to    Could
                          change the stacking     
                          order of overlapping    
                          elements.               

  CAN-10                  Dragging and basic      Must
                          canvas interactions     
                          must work on touch      
                          devices.                

  CAN-11                  Viewers must not be     Must
                          able to alter element   
                          positions or sizes.     
  -----------------------------------------------------------------------

### 5.3 Canvas behaviour and usability

-   Moving an element must not accidentally open its edit interface.
-   Editing controls should be easy to discover but should not clutter
    the board.
-   The application should provide clear feedback when content is being
    saved.
-   If a save fails, the user should be informed and the unsaved change
    should not silently disappear.
-   The initial canvas size and positioning model should be chosen to
    work consistently across screen sizes.

------------------------------------------------------------------------

## 6. Visual categories and organization

### 6.1 Category approach

Categories are intended to be **visual groupings on the same canvas**,
not separate pages or mandatory filters.

Examples could include: - Family - Friends - Travel - Thoughts -
Everyday life - Volleybal - Sport - Work

These are examples only. The final names, colours, and number of
groupings can be personalized.

### 6.2 Category requirements

  -----------------------------------------------------------------------
  ID                      Requirement             Priority
  ----------------------- ----------------------- -----------------------
  CAT-01                  The board should        Should
                          support visual category 
                          groupings on the main   
                          canvas.                 

  CAT-02                  Groupings should be     Should
                          visually                
                          distinguishable, for    
                          example through         
                          headings, background    
                          areas, colours, or      
                          decorative labels.      

  CAT-03                  Content should be       Should
                          placeable within or     
                          near a visual grouping. 

  CAT-04                  Categories must not     Must
                          require separate pages  
                          in the MVP.             

  CAT-05                  The board should remain Must
                          usable if Eefje chooses 
                          not to use categories.  

  CAT-06                  Custom category         Could
                          creation and editing    
                          may be added if time    
                          allows.                 

  CAT-07                  Category filtering is   Could
                          not required for the    
                          MVP.                    
  -----------------------------------------------------------------------

Categories are an organizational and visual aid. They should not make
the board feel rigid or turn it into a conventional folder-based
application.

------------------------------------------------------------------------

## 7. Content types and content management

The MVP has three primary content types:

1.  Thoughts / sticky notes.
2.  Pictures.
3.  Lists.

A separate memory-card feature is not required. A picture with an
optional caption can be used to preserve a memory.

### 7.1 Thoughts and sticky notes

  -----------------------------------------------------------------------
  ID                      Requirement             Priority
  ----------------------- ----------------------- -----------------------
  NOTE-01                 Eefje must be able to   Must
                          create a text note.     

  NOTE-02                 A note must support     Must
                          text content.           

  NOTE-03                 A note may support an   Should
                          optional short title.   

  NOTE-04                 Eefje must be able to   Must
                          edit an existing note.  

  NOTE-05                 Eefje must be able to   Must
                          delete a note.          

  NOTE-06                 Eefje should be able to Should
                          choose from a small set 
                          of note colours.        

  NOTE-07                 A note must be movable  Must
                          on the canvas.          

  NOTE-08                 A note should be        Should
                          resizable.              

  NOTE-09                 A note may display a    Could
                          creation or             
                          last-updated date.      
  -----------------------------------------------------------------------

Notes should be quick to create and should not require a title,
category, or date.

### 7.2 Pictures

  -----------------------------------------------------------------------
  ID                      Requirement             Priority
  ----------------------- ----------------------- -----------------------
  IMG-01                  Eefje must be able to   Must
                          upload pictures from a  
                          supported device.       

  IMG-02                  Uploaded pictures must  Must
                          be stored persistently. 

  IMG-03                  A picture must be       Must
                          displayed as an element 
                          on the canvas.          

  IMG-04                  Eefje should be able to Should
                          add an optional caption 
                          to a picture.           

  IMG-05                  Eefje must be able to   Must
                          remove a picture from   
                          the board.              

  IMG-06                  Eefje should be able to Should
                          replace a picture.      

  IMG-07                  A picture must be       Must
                          movable on the canvas.  

  IMG-08                  A picture should be     Should
                          resizable while         
                          retaining its aspect    
                          ratio by default.       

  IMG-09                  The application should  Must
                          validate supported file 
                          types and file sizes.   

  IMG-10                  The application should  Should
                          optimize or resize      
                          large uploads where     
                          practical.              
  -----------------------------------------------------------------------

The implementation should consider storage limits and image loading
performance. Images should not be stored directly as large binary values
in ordinary database rows; use object/file storage and save references
and metadata in the database.

### 7.3 Lists

  -----------------------------------------------------------------------
  ID                      Requirement             Priority
  ----------------------- ----------------------- -----------------------
  LIST-01                 Eefje must be able to   Must
                          create a list.          

  LIST-02                 A list must have a      Must
                          title.                  

  LIST-03                 Eefje must be able to   Must
                          add items to a list.    

  LIST-04                 Eefje must be able to   Must
                          edit list items.        

  LIST-05                 Eefje must be able to   Must
                          delete list items.      

  LIST-06                 Eefje must be able to   Must
                          mark and unmark items   
                          as completed.           

  LIST-07                 Eefje must be able to   Must
                          delete an entire list.  

  LIST-08                 A list must be movable  Must
                          on the canvas.          

  LIST-09                 A list should be        Should
                          resizable.              

  LIST-10                 List item completion    Must
                          states must persist     
                          after reloading the     
                          page.                   
  -----------------------------------------------------------------------

Examples include wishlists, goals, things to do, places to visit, or
things to remember.

### 7.4 General content management

  -----------------------------------------------------------------------
  ID                      Requirement             Priority
  ----------------------- ----------------------- -----------------------
  CNT-01                  Eefje must be able to   Must
                          create, edit, and       
                          delete supported        
                          content types.          

  CNT-02                  Eefje must be able to   Must
                          move content on the     
                          canvas.                 

  CNT-03                  Eefje should be able to Should
                          resize supported        
                          content elements.       

  CNT-04                  Changes to content must Must
                          persist between visits. 

  CNT-05                  Viewers must have       Must
                          read-only access to all 
                          content.                

  CNT-06                  Deleting an image from  Should
                          the board should also   
                          handle its stored file  
                          safely, avoiding        
                          orphaned files where    
                          practical.              
  -----------------------------------------------------------------------

------------------------------------------------------------------------

### 7.5 Standalone text and section headings (phase 5 addition)

Agreed scope addition on 5 November 2026: provide a separate text-only
board element, not a sticky note with a transparent background. This is
planned for phase 5 and is not a missing phase 4 deliverable.

| ID | Requirement | Priority |
| --- | --- | --- |
| TEXT-01 | Editors can create, edit and delete standalone plain-text elements directly on the board, without a note background, border or frame. | Must (phase 5) |
| TEXT-02 | Text elements can be moved and resized, with font-size, colour and alignment controls. Changes persist through the existing autosave flow. | Must (phase 5) |
| TEXT-03 | Text elements can label sections containing lists, notes and pictures. These headings do not automatically group, contain or move nearby cards. | Must (phase 5) |
| TEXT-04 | Editing and positioning controls are editor-only. Viewers see only the styled text, with no editing chrome. Text remains readable on phone and desktop. | Must (phase 5) |
| TEXT-05 | Add one editable, movable text element reading “Eefje's universum” near the centre of the initial board, as a starting point to arrange content around. It is not a fixed background or a title that follows the board's expanding centre. | Must (phase 5) |

The central title must not be recreated on every visit or duplicated if an
editor moves, edits or deletes it. Broader font-size choices for notes and
lists are also deferred to phase 5.

## 8. Saving, data persistence, and recovery

  -----------------------------------------------------------------------
  ID                      Requirement             Priority
  ----------------------- ----------------------- -----------------------
  DATA-01                 Board content must be   Must
                          stored in a persistent  
                          database.               

  DATA-02                 Uploaded images must be Must
                          stored in persistent    
                          file/object storage.    

  DATA-03                 Content, positions,     Must
                          sizes, and list         
                          completion states must  
                          persist between         
                          sessions.               

  DATA-04                 The application should  Must
                          save changes            
                          automatically.          

  DATA-05                 The interface should    Should
                          indicate saving, saved, 
                          or failed states where  
                          useful.                 

  DATA-06                 Failed saves must be    Must
                          communicated clearly.   

  DATA-07                 The data model should   Should
                          allow new content types 
                          or fields to be added   
                          later without major     
                          restructuring.          

  DATA-08                 A backup or             Should
                          export/recovery         
                          approach should be      
                          documented.             

  DATA-09                 The application should  Should
                          avoid data loss when a  
                          user refreshes or       
                          closes the browser      
                          during a save.          
  -----------------------------------------------------------------------

The MVP does not need sophisticated version history or collaborative
conflict resolution because there is only one intended editor.

------------------------------------------------------------------------

## 9. Visual design requirements

  -----------------------------------------------------------------------
  ID                      Requirement             Priority
  ----------------------- ----------------------- -----------------------
  VIS-01                  The website must have a Must
                          distinctive, personal   
                          identity under the name 
                          "Eefje's universum".    

  VIS-02                  The design should feel  Must
                          warm, playful,          
                          personal, and           
                          scrapbook-like.         

  VIS-03                  The canvas should be    Must
                          the main visual focus.  

  VIS-04                  Notes, pictures, and    Must
                          lists should have       
                          visually distinct       
                          treatments.             

  VIS-05                  The design should       Should
                          support a small,        
                          coherent palette of     
                          colours.                

  VIS-06                  Decorative details such Could
                          as tape, pins,          
                          stickers, or subtle     
                          textures may be used.   

  VIS-07                  Decoration must not     Must
                          reduce readability or   
                          make editing difficult. 

  VIS-08                  The design must remain  Must
                          usable on mobile        
                          screens.                
  -----------------------------------------------------------------------

The final aesthetic, typography, colour palette, and decorative style
are to be decided during the UI/UX design phase.

------------------------------------------------------------------------

## 10. Non-functional requirements

### 10.1 Performance

  -----------------------------------------------------------------------
  ID                      Requirement             Priority
  ----------------------- ----------------------- -----------------------
  NFR-01                  The board should load   Should
                          within a reasonable     
                          time on ordinary        
                          broadband and mobile    
                          connections.            

  NFR-02                  Images should be loaded Should
                          efficiently and should  
                          not block the entire    
                          board from rendering.   

  NFR-03                  Dragging and scrolling  Must
                          should feel responsive  
                          on supported devices.   

  NFR-04                  The application should  Should
                          avoid unnecessary       
                          frontend complexity and 
                          heavy dependencies.     
  -----------------------------------------------------------------------

### 10.2 Compatibility and accessibility

  -----------------------------------------------------------------------
  ID                      Requirement             Priority
  ----------------------- ----------------------- -----------------------
  NFR-05                  Support current         Must
                          versions of common      
                          desktop and mobile      
                          browsers.               

  NFR-06                  Controls should have    Should
                          clear labels and usable 
                          touch targets.          

  NFR-07                  Text should have        Must
                          sufficient contrast     
                          against its background. 

  NFR-08                  Core functionality      Must
                          should not depend       
                          exclusively on hover    
                          interactions.           
  -----------------------------------------------------------------------

### 10.3 Maintainability

  -----------------------------------------------------------------------
  ID                      Requirement             Priority
  ----------------------- ----------------------- -----------------------
  NFR-09                  The application should  Should
                          use a straightforward,  
                          widely supported        
                          technology stack.       

  NFR-10                  Setup and deployment    Should
                          instructions must be    
                          documented.             

  NFR-11                  Secrets and             Must
                          environment-specific    
                          configuration must not  
                          be committed to source  
                          control.                

  NFR-12                  The project should be   Must
                          simple enough for one   
                          developer to maintain.  
  -----------------------------------------------------------------------

### 10.4 Cost

  -----------------------------------------------------------------------
  ID                      Requirement             Priority
  ----------------------- ----------------------- -----------------------
  COST-01                 Initial development     Must
                          should use free tiers   
                          or low-cost services    
                          where practical.        

  COST-02                 Ongoing hosting and     Must
                          storage costs should be 
                          minimal.                

  COST-03                 A paid custom domain is Should
                          optional, not a         
                          prerequisite.           

  COST-04                 Expected free-tier      Must
                          limits and potential    
                          upgrade costs must be   
                          checked before          
                          deployment.             
  -----------------------------------------------------------------------

------------------------------------------------------------------------

## 11. Proposed technical direction

The following is a **provisional recommendation**, not a locked
implementation decision.

  -----------------------------------------------------------------------
  Layer                   Proposed option         Reason
  ----------------------- ----------------------- -----------------------
  Frontend                React + Vite            Lightweight, familiar,
                                                  suitable for a custom
                                                  interactive canvas

  Styling                 Tailwind CSS            Fast iteration on a
                                                  personalized responsive
                                                  design

  Hosting                 Cloudflare Pages or     Simple deployment and
                          Vercel                  low-cost hosting
                                                  options

  Database                Supabase PostgreSQL     Managed relational
                                                  database

  Image storage           Supabase Storage        Persistent image/file
                                                  storage

  Access control          Server-side password    Separate viewer/editor
                          verification and        permissions
                          role-aware sessions, or 
                          an appropriate managed  
                          authentication setup    
  -----------------------------------------------------------------------

### 11.1 Architecture principles

-   Do not build or operate a custom server unless the selected
    hosting/backend approach requires it.
-   Keep frontend code, data persistence, image storage, and access
    control clearly separated.
-   Enforce viewer/editor permissions at the backend.
-   Store image files in object storage and image metadata/references in
    the database.
-   Keep the data model simple and extensible.
-   Confirm current provider pricing, free-tier limits, and security
    capabilities before choosing services.

### 11.2 Possible high-level data model

A preliminary data model could include:

**Board** - Board ID - Board title - Board settings

**Board element** - Element ID - Board ID - Element type (`note`,
`image`, `list`) - Position (x, y) - Size (width, height) - Stacking
order - Optional visual grouping/category ID - Created timestamp -
Updated timestamp

**Note content** - Element ID - Optional title - Text - Colour

**Image content** - Element ID - Storage object reference - Optional
caption - Image metadata

**Standalone text content (phase 5)** - Element ID - Plain text - Font size -
Text colour - Alignment. Extend the board element types with `text` when
implementing this addition; it is not currently part of the persisted schema.

**List content** - Element ID - Title

**List item** - Item ID - Parent list ID - Text - Completed state -
Display order

**Visual grouping** - Group ID - Name - Colour/style - Position and
size - Optional decorative settings

This is a starting point for technical design. The exact schema should
be finalized before implementation.

------------------------------------------------------------------------

## 12. MVP scope and prioritization

### 12.1 Included in MVP

-   [ ] Private, non-indexed website with a non-obvious URL.
-   [ ] Separate viewing and editing passwords.
-   [ ] Server-side authorization for viewing and editing.
-   [ ] Direct landing on the board after authentication.
-   [ ] One main free-form canvas.
-   [ ] Visual groupings on the canvas.
-   [ ] Create, edit, and delete sticky notes.
-   [ ] Upload, display, caption, and delete pictures.
-   [ ] Create and manage lists with checkable items.
-   [ ] Move canvas elements with drag-and-drop.
-   [ ] Automatic persistence of content and layout.
-   [ ] Responsive desktop and mobile experience.
-   [ ] Personalized scrapbook-like visual design.
-   [ ] Basic deployment and recovery documentation.

### 12.2 Not included in MVP

-   Multiple boards or separate category pages.
-   Mandatory category assignment or category filtering.
-   Individual user accounts.
-   Multiple editors or simultaneous collaboration.
-   Comments, reactions, or messaging.
-   Notifications and reminders.
-   Advanced search.
-   A separate memory-card feature.
-   Photo editing tools.
-   Drawing tools or freehand annotation.
-   Complex animations.
-   AI features.
-   Public sharing or social features.
-   Advanced history/versioning.

### 12.3 Could-have enhancements

These may be considered after the MVP is working: - More decorative
stickers and visual elements. - More note styles and fonts. - Custom
category/group creation. - Bring-to-front/send-to-back controls. -
Better image cropping and presentation options. - Export or backup of
the board. - A custom domain.

------------------------------------------------------------------------

## 13. Acceptance criteria

The MVP can be considered ready to give to Eefje when all of the
following are true:

### Access and privacy

-   [ ] An unauthenticated visitor cannot see board content or access
    protected data.
-   [ ] The viewing password grants read-only access.
-   [ ] The editing password grants editing access.
-   [ ] A viewer cannot modify content through the interface or by
    directly calling backend operations.
-   [ ] The site uses HTTPS and is configured not to be indexed.
-   [ ] Passwords and session credentials are not exposed in client-side
    code or URLs.

### Canvas

-   [ ] The board opens directly after successful authentication.
-   [ ] The canvas displays notes, pictures, and lists.
-   [ ] Eefje can move elements around the board.
-   [ ] Element positions remain correct after a page reload.
-   [ ] The board can be navigated on desktop and mobile.

### Content

-   [ ] Eefje can create, edit, and delete notes.
-   [ ] Eefje can upload and display pictures.
-   [ ] Eefje can add captions to pictures if that feature is included
    in the release.
-   [ ] Eefje can create lists, manage their items, and check/uncheck
    items.
-   [ ] Content changes remain saved after leaving and returning to the
    site.

### Usability and reliability

-   [ ] The website is visually polished and personalized.
-   [ ] Core actions are understandable without technical guidance.
-   [ ] The interface works on a desktop and a mobile device.
-   [ ] Failed saves or uploads provide understandable feedback.
-   [ ] There is a documented way to change passwords and recover or
    back up important data.

------------------------------------------------------------------------

## 14. Implementation roadmap

Estimated effort for one developer familiar with the chosen stack:

  ------------------------------------------------------------------------
  Phase                 Work                                      Estimate
  --------------------- --------------------- ----------------------------
  1\. Foundation        Repository, app                         1--2 hours
                        setup, hosting,       
                        environment           
                        configuration         

  2\. Data and security Database, storage,                      2--4 hours
                        password roles,       
                        backend authorization 

  3\. Canvas            Canvas layout,                          3--6 hours
                        element positioning,  
                        drag-and-drop,        
                        responsive            
                        interactions          

  4\. Content           Notes, picture                          3--5 hours
                        uploads, lists,       
                        editing and deletion  

  5\. Visual design     Personal styling,                       2--4 hours
                        visual groupings,     
                        responsive polish     

  6\. Testing and       Permission tests,                       2--3 hours
  release               mobile tests,         
                        deployment, backup    
                        notes                 

  **Total**                                               **13--24 hours**
  ------------------------------------------------------------------------

These are rough estimates. The canvas interactions, mobile behaviour,
and secure implementation of the two-password model are the largest
uncertainties.

### Implementation checkpoint — 5 November 2026

Phase 4 content implementation is complete: notes, lists, private photo
uploads, captions, staged replacement with Done/Cancel, deletion feedback,
larger photo cards and full-screen photo viewing. The user has reported PC
and phone testing; the latest photo-size/viewer changes still need a final
phone recheck. Automated verification currently passes 81 tests, typecheck
and the production build.

Proceed to phase 5 with the standalone text elements in section 7.5,
personal styling, broader font sizes, IndexedDB drafts and failed-save
polish. Carry over the misleading session-expiry banner for permission
failures and the re-login draft/queue recovery fix and verification.
Phase 4 implementation completion is not a production release sign-off:
hosted upload/privacy checks, remaining failure/recovery acceptance checks,
backups and restore verification remain release gates.

### Suggested development order

1.  Confirm the visual direction and basic screen layout.
2.  Set up the frontend and hosting.
3.  Set up database and image storage.
4.  Implement password access and backend permission enforcement.
5.  Build the canvas and persistent element positioning.
6.  Implement notes.
7.  Implement pictures and uploads.
8.  Implement lists.
9.  Add visual groupings and polish.
10. Test permissions, saving, mobile use, and deployment.

------------------------------------------------------------------------

## 15. Open questions and decisions for the next planning phase

The product direction is defined, but these details remain open:

### Product and design

-   What colour palette and overall aesthetic best represent Eefje?
-   Which visual groupings should be present when the board is first
    opened?
-   Should the board have a corkboard, paper, wall, or another visual
    background?
-   Should the canvas have a fixed large size or expand as content is
    added?

### Canvas interactions

-   Should the canvas support zooming, or is scrolling sufficient?
-   Should elements be freely resizable or use a few predefined sizes?
-   Should visual groupings be movable/resizable areas or simply
    decorative labels?

### Access and administration

-   How will the two passwords be initially configured and changed?
-   Should an editing session expire after a period of inactivity?
-   Is a simple shared-password model sufficient long-term, or might
    individual accounts be desirable later?

### Content

-   Which image formats and maximum upload size should be supported?
-   Should deleting an item require confirmation?
-   Should notes and lists have optional titles or dates?

### Technical and operational

-   Which hosting and backend provider offers the best fit at the time
    of implementation?
-   What are the actual free-tier storage, bandwidth, and database
    limits?
-   What is the simplest reliable backup/export strategy?
-   What is the final target date for the Sinterklaas gift?

------------------------------------------------------------------------

## 16. Final product summary

**Eefje's universum** is a private, password-protected, responsive
digital scrapbook built around one free-form canvas.

Eefje receives an editing password and can share a separate viewing
password with people she chooses. Once authenticated, visitors land
directly on the board. Eefje can arrange three types of
content---thoughts, pictures, and lists---within visual groupings on the
same canvas.

The first release should focus on being personal, attractive, easy to
use, secure, and inexpensive to operate. Advanced productivity features
and unnecessary complexity are intentionally excluded.

**Guiding principle:** Build a small, polished, personal digital
universe---not a complicated productivity tool.
