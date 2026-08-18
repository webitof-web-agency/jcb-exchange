JCB Exchange Platform
Complete UI/UX Design Guide

1. Design Objective
Platform ka UI visually modern hona chahiye, lekin over-designed nahi.
Primary goals:
Customer ko jaldi relevant machine milni chahiye
Dealer ko listing add karna simple lagna chahiye
Admin ko pending work clearly visible hona chahiye
Phone, WhatsApp aur enquiry actions prominent hone chahiye
Mobile network slow hone par bhi platform usable rehna chahiye
Hindi aur English dono users easily platform use kar saken
Trust, verification aur machine condition clearly communicate honi chahiye
Platform ka design “premium automobile website” jaisa glossy nahi, balki reliable industrial marketplace jaisa hona chahiye.

2. Core UX Principles
2.1 Mobile-First Design
Majority customers mobile phone se platform use karenge.
Isliye:
Mobile layout pehle design hoga
Desktop mobile layout ka stretched version nahi hoga
Primary CTA thumb reach ke andar hoga
Forms single-column honge
Listing gallery swipeable hogi
Filters bottom sheet me open honge
Call aur WhatsApp buttons sticky rahenge

2.2 Minimum Friction
Customer ko listing browse karne ke liye login force nahi karna chahiye.
Recommended:
Browse without login
Listing details without login
Contact reveal par login
Favourite par login
Alert creation par login
Enquiry submit par OTP verification

2.3 Trust First
Used-equipment marketplace me design ka main kaam trust create karna hai.
Trust elements:
KYC verified partner badge
Documents reviewed badge
Physical inspection badge
Listing last updated date
Clear listing ID
Dealer response time
Report listing option
Safety advisory
No fake urgency
No misleading “100% verified” label

2.4 Clear Action Hierarchy
Listing page par customer confuse nahi hona chahiye.
Primary actions:
Call
WhatsApp
Send enquiry
Secondary actions:
Favourite
Compare
Share
Request inspection
Request documents
Finance request
Primary aur secondary actions visually separate honge.

2.5 Progressive Disclosure
Har information ek hi screen par dump nahi karni.
Example:
Listing detail page:
Top section me price, model, year, location, hours
Technical details accordion me
Dealer details separate section me
Documents request section separately
Safety guidance page bottom par

3. Target User Types
3.1 Customer Profile
Likely customer:
Contractor
Builder
Machine operator
Small fleet owner
Rural business owner
Construction company
Equipment reseller
UX assumptions:
Technical machine terms samajhta hai
Advanced app interfaces zaroori nahi samajhta
Fast answer chahta hai
Phone aur WhatsApp prefer karta hai
English fluency mixed ho sakti hai
Slow internet use kar sakta hai

3.2 Dealer/Broker Profile
Likely partner:
Multiple listings manage karega
Mobile se photos upload karega
Form jaldi complete karna chahega
Rejection ka exact reason chahega
Lead ka mobile number aur enquiry source clearly dekhna chahega
Analytics simple language me samajhna chahega

3.3 Admin Profile
Admin ka workflow task-based hoga.
Admin ko:
Pending applications
Pending KYC
Pending listings
Refund requests
Failed media deletion
Complaints
clear priority me dikhne chahiye.
Admin dashboard ko decorative graphs se bharna galat hoga. Work queues revenue charts se zyada important hain.

4. Brand Personality
Brand tone:
Reliable
Practical
Direct
Industrial
Transparent
Professional
Local-market friendly
Avoid:
Luxury branding
Overly playful icons
Cartoon illustrations
Excessive animations
Fake countdown timers
Overuse of gradients
Too many bright colors

5. Visual Design Direction
Recommended visual direction:
White or light neutral page background
Dark charcoal text
Strong industrial yellow as primary accent
Deep navy or black for headers
Green only for WhatsApp/success
Red only for danger, errors and sold status
Orange for pending/warnings
Blue for informational states
JCB brand assets, logo or official brand yellow should not be copied without trademark permission. Platform ko apni independent visual identity chahiye.

6. Suggested Color System
Final colors accessibility testing ke baad lock honge.
Primary
Industrial yellow
Dark charcoal
White
Semantic Colors
Success: Green
Warning: Amber
Error: Red
Information: Blue
Neutral: Grey
Status Usage
Available: Green
Reserved: Amber
Sold: Red
Draft: Grey
Pending approval: Blue
Changes requested: Orange
Rejected: Red
Verified: Green or blue
Suspended: Dark red
Color ke saath text label mandatory hoga. Sirf color se status communicate nahi karna.

7. Typography
Typography simple aur highly readable honi chahiye.
Recommended:
Clean sans-serif font
Hindi and English support
Strong numeric readability
Large price typography
Clear differences between headings and labels
Suggested scale:
Display heading: 36–48 px desktop
Page heading: 28–36 px
Section heading: 22–28 px
Card heading: 18–20 px
Body: 15–16 px
Supporting text: 13–14 px
Button text: 14–16 px
Mobile body font 16 px se kam nahi hona chahiye.

8. Spacing System
Consistent spacing scale:
4 px
8 px
12 px
16 px
24 px
32 px
48 px
64 px
Default:
Card padding: 16–24 px
Section gap: 32–64 px
Form field gap: 16–20 px
Mobile page side padding: 16 px
Desktop container: 1200–1360 px

9. Border Radius and Shadows
Industrial marketplace me excessively rounded design avoid karein.
Recommended:
Inputs: 6–8 px radius
Cards: 8–12 px
Buttons: 6–10 px
Pills/badges: fully rounded
Modals: 12–16 px
Shadows subtle honi chahiye.
Cards ko shadow se zyada border aur spacing se separate karein.

10. Iconography
Icons:
Simple outline icons
Consistent stroke width
Text labels ke saath
Familiar symbols
Common icons:
Search
Location
Calendar/year
Meter/operating hours
Phone
WhatsApp
Heart
Compare
Share
Verified
Video
Finance
Inspection
Dealer
Warning
Upload
Delete
Edit
Unfamiliar icon ko bina label ke use nahi karna.

11. Responsive Breakpoints
Recommended:
Mobile: 320–767 px
Tablet: 768–1023 px
Small desktop: 1024–1279 px
Large desktop: 1280 px+
Design har breakpoint par intentionally adjust hoga.

12. Global Website Header
Desktop Header
Header structure:
Logo
Search bar
Location selector
Browse listings
Dealer registration
Login/profile
Language selector
Optional secondary navigation:
JCB listings
Excavators
Dealers
Buyer guides
Sell as partner
Header sticky ho sakta hai, lekin height compact rahe.

Mobile Header
Mobile:
Hamburger menu
Logo
Search icon
Profile/login icon
Location selector search area ke andar ya below header rahe.
Header ko unnecessary menu items se clutter nahi karna.

13. Mobile Bottom Navigation
PWA/mobile logged-in customer ke liye:
Home
Search
Saved
Alerts
Account
Partner ke liye:
Dashboard
Listings
Add
Leads
Account
Admin panel me mobile bottom navigation avoid ki ja sakti hai. Admin workflows desktop/tablet optimized rahenge.

14. Footer Structure
Footer sections:
Browse by category
Popular models
Popular cities
Customer support
Dealer registration
About
Terms
Privacy
Refund policy
Safety tips
Social links
App/PWA install
Footer me excessive SEO keyword links mat bharna.

15. Homepage UX Flow
Homepage ka primary objective:
Search → Listing discovery → Listing details → Contact

Homepage Top Section
Hero area:
Clear heading
Search input
Location selector
Category/model selector
Search button
Suggested heading:
“Verified Used JCB and Construction Equipment Near You”
Hero me decorative background video avoid karein. It will slow the page and distract users.

Homepage Search
Search fields:
What are you looking for?
Location
Optional price range
Search CTA
Mobile par:
Search field full width
Location below
Large search button
Recent searches show ki ja sakti hain.

Homepage Content Order
Recommended order:
Search hero
Browse by category
Latest listings
Featured listings
Search by location
Popular models
Verified dealers
How it works
Recently sold
Buyer guides
Dealer registration CTA
Trust and safety
Footer

16. Category Cards
Category card me:
Category image/icon
Category name
Active listing count
CTA arrow
Examples:
Backhoe Loader
Excavator
Wheel Loader
Telehandler
Cards clickable honi chahiye.
Mobile par horizontal scroll acceptable hai, lekin first card partially cut nahi hona chahiye.

17. Listing Card Design
Listing card marketplace ka most important reusable component hoga.
Required Information
Featured image
Featured/verified/video badge
Price
Title
Year
Operating hours
Location
Dealer name or seller type
Published/updated date
Favourite icon
Compare option
Optional:
Finance available
Inspection available
Price negotiable

Listing Card Layout
Desktop
Image top or left
Price highly visible
Title two lines maximum
Specs compact row
Location
CTA
Mobile
Large image
Price below image
Model/title
Year, hours, location
Favourite button image corner par
Card fully clickable

Listing Card States
Card variants:
Available
Featured
Reserved
Sold
Suspended
Price dropped
Newly listed
Video available
Sold card ko visually subdued karein, lekin unreadable nahi.

18. Search Results Page
Desktop Layout
Header
Search summary
Left filter sidebar
Result count
Sort control
Grid/list toggle
Listing results
Pagination
Recommended grid:
3 cards on desktop
2 cards on tablet
1 card on mobile

Mobile Layout
Mobile search page:
Search input
Filter button
Sort button
Result count
Listing cards
Sticky filter/sort bar
Filters bottom sheet ya full-screen drawer me open hon.

19. Filter UX
Filters grouped hon:
Location
State
District
City
Radius
Machine
Category
Brand
Model
Variant
Price
Minimum
Maximum
Year and Usage
Manufacturing year
Operating hours
Condition
Condition
Ownership
Inspection
Verified
Video

Filter Interaction Rules
Selected filter count show ho
Apply button visible ho
Clear all option ho
Individual chips remove kiye ja saken
Results count live ya on apply update ho
Long filter lists searchable hon
Default options preselected na hon
Mobile filter drawer me Apply button bottom sticky hona chahiye.

20. Sort UX
Sort options:
Recommended
Newest
Price low to high
Price high to low
Year newest
Lowest operating hours
Nearest
“Most popular” tabhi use karein jab ranking logic meaningful ho.

21. Empty Search State
No results par blank page nahi.
Show:
“No matching listings found”
Applied filters summary
Clear filters button
Expand location suggestion
Increase budget suggestion
Similar listings
Create alert CTA
Microcopy practical honi chahiye.

22. Listing Detail Page Layout
Listing detail page platform ka highest-conversion screen hoga.
Desktop Structure
Left side:
Image gallery
Video
Specifications
Description
Documents/inspection
Similar listings
Right sticky sidebar:
Price
Listing status
Key specs
Contact buttons
Dealer card
Finance/inspection CTA

Mobile Structure
Gallery
Status badges
Title
Price
Key specs
Sticky contact buttons
Description
Technical specifications
Dealer information
Inspection and finance
Similar listings
Safety tips

23. Listing Image Gallery UX
Gallery:
Swipe support
Full-screen mode
Thumbnail strip desktop
Image count
Zoom
Video thumbnail
Damage images clearly labeled
Featured image first
Mobile par pinch zoom optional but useful.
Image loading skeleton use karein.

24. Listing Video UX
Video card:
Clear play button
Video type label
Duration
Poster thumbnail
Full-screen support
Auto-play video use nahi karna.
Mobile data consumption ka warning large video ke liye show kiya ja sakta hai.

25. Listing Top Information
Top section me immediately visible:
Listing status
Title
Price
Negotiable label
Model
Year
Operating hours
Location
Updated date
Listing ID
User ko basic details ke liye scroll nahi karna chahiye.

26. Sticky Contact CTA
Mobile sticky footer:
Call
WhatsApp
Enquiry
Recommended layout:
Call and WhatsApp equal width
Enquiry icon or secondary button
Sold listing par sticky bar replace ho:
“Sold — View Similar Listings”

27. Phone Reveal UX
Phone reveal click par:
Login check
Mobile verification
Contact rule check
Number reveal
Number reveal dialog me:
Contact person
Number
Call button
Copy button
Safety note
Listing ID
Repeated clicks par unnecessary OTP nahi.

28. WhatsApp UX
WhatsApp button:
Clearly labeled
Correct recipient routing
Pre-filled message
Same tab/new app behavior device-aware
User ko vague label “Chat” nahi dikhana. “WhatsApp Dealer” ya “WhatsApp JCB Exchange” clearer hoga.

29. Enquiry Form UX
Enquiry form short rakhein.
Initial fields:
Name
Mobile
Message
Preferred contact time
Additional optional fields:
Budget
Finance required
Inspection required
Login customer ke data prefilled hon.
Form ko 12 fields ka lead-generation torture form mat banaiye.

30. Dealer Information Card
Card me:
Dealer/business name
Verification status
City
Member since
Active listings
Response time
Public contact state
View profile CTA
Badges ko exact meaning ke saath tooltip dena:
KYC Verified
Documents Reviewed
Physical Inspection Completed

31. Trust and Safety Section
Listing page par:
Pay advance only after verification
Inspect machine and documents
Platform does not guarantee seller claims
Report suspicious listing
Do not share OTP
Text concise aur readable ho.

32. Compare Page UX
Desktop par table comparison.
Mobile par:
Horizontal comparison cards
Sticky machine names
Difference highlight
Remove listing option
Only meaningful attributes show karein.
Empty or unavailable values:
“Not provided”
Fake “N/A” overload avoid karein.

33. Customer Login UX
Login modal/page options:
Mobile OTP
Continue with Google
Continue with email
Recommended default:
Mobile OTP
Reason: marketplace conversion and contact verification.
Login page me:
Clear privacy message
OTP resend timer
Wrong number edit
Error message
Terms link

34. OTP Screen UX
OTP UI:
Six separate or grouped boxes
Auto-focus
Auto-read where supported
Paste support
Resend timer
Change number link
Clear error
Error copy:
“OTP incorrect hai. Dobara check karein.”
Not:
“Authentication token validation failed.”

35. Customer Dashboard UX
Dashboard simple hona chahiye.
Top summary:
Saved listings
Active alerts
Enquiries
Recently viewed
Sections:
Saved listings
Saved searches
Enquiries
Inspection requests
Notifications
Account settings
Customer dashboard ko complex charts ki zaroorat nahi.

36. Saved Listings UX
Saved card states:
Available
Reserved
Sold
Price changed
Actions:
View listing
Remove
Compare
Contact
View similar
Sold favourite ko silently disappear mat karein.

37. Saved Search UX
Saved search card:
Search title
Location
Model/category
Price range
Alert frequency
Channel
Edit
Pause
Delete
View results
User ko alert active/inactive clearly dikhe.

38. Notification Centre UX
Notifications grouped:
Today
Earlier
Account
Listings
Leads
Each notification:
Icon
Title
One-line detail
Timestamp
Read/unread state
CTA
Notification settings separate screen par hon.

39. Partner Registration UX
Partner registration ek long single-page form nahi hona chahiye.
Use stepper:
Basic details
Business profile
KYC
Deposit/letter
Agreement
Review
Top par progress bar.
Mobile par each step separate screen ya collapsible section.

40. Partner Onboarding Stepper
Each step state:
Not started
In progress
Completed
Changes requested
Approved
Navigation:
Save and continue
Back
Exit and save
Submit
Partner ko exact pending task show ho.
Example:
“Cancelled cheque dobara upload karein. Current file unclear hai.”

41. KYC Upload UX
Each document card:
Document name
Why required
File requirements
Upload button
Preview
Replace
Status
Admin comment
Status examples:
Pending review
Approved
Re-upload required
Rejected
Rejected document ke upar exact reason visible ho.

42. Security Deposit UX
Deposit screen me options cards:
Pay online
Bank transfer
Upload guarantee/letter
Each option me:
Amount
Lock-in
Refund eligibility
Processing status
Supporting instructions
Refund terms payment CTA ke paas visible hon.
Hidden fine print trust destroy karega.

43. Partner Dashboard UX
Dashboard top area:
Welcome/profile
Account status
KYC warning
Deposit warning
Add listing CTA
Summary cards:
Active
Pending approval
Changes requested
Leads
Sold
Expiring
Below:
Recent leads
Listing performance
Pending actions
Notifications
“Add Listing” button highly prominent hona chahiye.

44. Partner Listing Table
Desktop columns:
Image
Listing ID
Model
Price
Status
Views
Leads
Updated
Actions
Mobile card:
Image
Model
Listing ID
Status
Price
Leads
Edit/view actions
Avoid horizontal scrolling tables on mobile.

45. Listing Creation Form UX
Listing form multi-step hoga:
Category and model
Machine details
Price and location
Photos
Video and documents
Contact preferences
Preview and submit
Autosave mandatory.

46. Listing Form Header
Header me:
Listing ID
Draft status
Completion percentage
Last saved time
Preview
Save and exit
Mobile par compact header.

47. Listing Form Fields
Rules:
Labels above inputs
Required marker
Helper text
Example values
Unit visible
Numeric keyboard on mobile
Dropdowns searchable
Date picker where needed
Error immediately below field
Do not use placeholder as label.

48. Dynamic Specification UX
Category select hone ke baad relevant fields show hon.
Example:
Backhoe loader:
Bucket capacity
Digging depth
Operating hours
Excavator:
Operating weight
Boom length
Bucket size
User ko irrelevant 50 fields mat dikhaiye.

49. Image Upload UX
Mobile upload options:
Take photo
Choose from gallery
Each required image slot labeled ho:
Front view
Rear view
Cabin
Engine
Meter
Tyres
Upload state:
Uploading
Processing
Ready
Failed
Image card actions:
Replace
Rotate
Delete
Make featured

50. Image Quality UX
Poor image par clear feedback:
“Image blur hai”
“Machine complete frame me nahi hai”
“Minimum resolution required”
“Another marketplace watermark detected”
User ko generic “Upload failed” mat dikhana.

51. Video Upload UX
Video upload page:
Video type
Upload or URL
File requirements
Progress
Processing status
Preview
Replace/delete
Large uploads background me continue hon, user form ke next step par ja sake.

52. Listing Preview UX
Preview exactly public listing jaisa hona chahiye.
Show:
Search card preview
Mobile listing preview
Desktop listing preview
Contact mode preview
Missing details warning
Submission ke pehle declaration checkbox.

53. Changes Requested UX
Admin changes request kare to partner dashboard me red generic banner nahi.
Show task list:
Price confirmation required
Front image blurry
Registration year mismatch
Video processing failed
Each task ke saath:
Reason
Go to field
Resolve status

54. Lead Management UX
Partner lead list filters:
New
Unread
Follow-up today
Overdue
Qualified
Won
Lost
Lead card/table:
Customer
Listing
Source
Time
Status
Assigned staff
Next follow-up
New lead visually prominent ho.

55. Lead Detail UX
Lead detail screen:
Top
Customer name
Phone
WhatsApp
Lead score
Status
Assigned staff
Listing
Image
Model
Price
Listing link
Activity timeline
Phone reveal
WhatsApp click
Enquiry
Calls
Notes
Status changes
Actions
Call
WhatsApp
Add note
Schedule follow-up
Change status

56. Follow-Up UX
Follow-up modal:
Date
Time
Type
Note
Reminder channel
Overdue lead card visibly marked.
No aggressive red for every overdue item. Red reserved for genuinely critical delays.

57. Mark as Reserved UX
Reserved modal:
Reservation date
Expiry
Customer
Notes
Contact behavior
Confirmation text:
“Listing reserved mark hone ke baad customers ko reserved status dikhai dega.”

58. Mark as Sold UX
Sold modal:
Sold date
Sold through platform
Lead/customer
Sold price
Remarks
Strong confirmation:
Contact actions disable
Alerts stop
Media deletion date schedule
User ko exact deletion date dikhani chahiye.

59. Partner Exit UX
Exit flow hidden nahi hona chahiye, lekin easy accidental action bhi nahi.
Steps:
Eligibility check
Active issues
Refund summary
Bank verification
Exit reason
Confirmation
Blockers clearly show hon:
2 active listings
1 complaint pending
₹5,000 outstanding

60. Refund UX
Refund page:
Original deposit
Adjustments
Deductions
Refundable amount
Refund status
Bank details
Timeline/status history
Support CTA
Every deduction expandable ho with evidence/reason.

61. Admin Panel UX Principles
Admin UI:
Dense but readable
Table-first
Powerful filters
Bulk actions
Status queues
Audit visibility
Role-specific dashboard
Admin panel public website jaisa visual nahi hona chahiye.

62. Admin Dashboard Structure
Top priority cards:
Partner approvals pending
KYC pending
Listings pending
Complaints
Refunds pending
Failed deletion jobs
Secondary metrics:
Active listings
New leads
Sold listings
Deposits held
Conversion
Charts below operational queues.

63. Admin Queue UX
Every queue me:
Search
Filters
Saved views
Sort
Bulk actions
Export
Row-level actions
Status tabs
Examples:
Pending today
Overdue
High risk
Changes requested
Recently updated

64. Admin KYC Review UX
Split-screen preferred:
Left:
Document list
Partner details
Risk flags
Right:
Document preview
Approve/reject controls
Notes
Actions:
Approve
Reject
Request re-upload
Flag suspicious
Keyboard shortcuts optional for high-volume review.

65. Admin Listing Review UX
Desktop split layout:
Left:
Listing preview
Photos/video
Specifications
Right:
Review checklist
Partner status
Duplicate alerts
Contact mode
Approval controls
Admin ko public preview aur raw data dono dikhna chahiye.

66. Admin Decision UX
Approve modal:
Contact mode
Expiry
Featured
Notification eligibility
Publish now/schedule
Reject modal:
Structured reasons
Internal note
Partner-visible note
Fraud flag
Suspend partner option
Free-text-only rejection system inconsistent hoga.

67. Admin Finance UX
Finance screen:
Deposit ledger
Refund queue
Reconciliation
Liability summary
Refund detail:
Original payment
Adjustments
Deductions
Supporting evidence
Approvals
Bank details
Transaction entry
High-value actions par two-step confirmation and audit note mandatory.

68. Admin Media Deletion UX
Deletion queue:
Listing
Sold date
Scheduled deletion
Media size
Legal hold
Status
Retry count
Actions:
Purge now
Extend retention
Add legal hold
Retry failed
View deleted objects

69. Admin Contact Rules UX
Contact rule interface hierarchy clear kare:
Platform default
Dealer-level setting
Listing-level override
Admin ko final output preview dikhna chahiye:
“Customer ko Admin WhatsApp number show hoga.”
Without preview, contact-rule bugs inevitable hain.

70. Status Badge System
Every status consistent component use kare.
Examples:
Draft
Pending
Approved
Published
Changes requested
Reserved
Sold
Suspended
Refunded
Badge includes:
Color
Text
Optional icon
Tooltip
Same status ko different pages par different colors mat dena.

71. Form Validation UX
Validation types:
Inline
Field-specific issue.
Section Summary
Step submit par unresolved issues.
Blocking Alert
Critical issue.
Error messages:
Specific
Actionable
Human language
Bad:
“Invalid input.”
Good:
“Manufacturing year 1980 se 2026 ke beech hona chahiye.”

72. Loading States
Use:
Skeleton cards
Image placeholders
Button spinner
Upload progress
Table skeleton
Processing state
Full-screen spinner only initial authentication or critical transition ke liye.

73. Empty States
Every empty state me:
Reason
Relevant illustration/icon
Next action
Examples:
No listings:
“Abhi koi listing add nahi ki gayi.”
CTA:
“Add First Listing”
No leads:
“Abhi tak koi customer enquiry nahi aayi.”
Secondary advice:
“Listing photos aur price update karke visibility improve karein.”

74. Error States
Need screens for:
No internet
Server error
Payment failed
OTP failed
Upload failed
Access denied
Listing unavailable
Account suspended
Session expired
Page not found
Each error me recovery CTA hona chahiye.

75. Offline PWA UX
Offline page:
You are offline
Recently viewed listings
Saved listings
Retry connection
Last synced time
Offline cached listing me:
“Information last updated on 6 August 2026”
Call/contact data stale ho sakta hai, isliye live verification required ho.

76. Notification Permission UX
Permission browser load par immediately mat maangiye.
Ask after meaningful action:
Save search
Favourite listing
Enable listing alert
Custom prompt:
“Matching JCB listings ka alert chahiye?”
Then browser permission.

77. Hindi and English UX
Language selector visible but not dominant.
Rules:
User preference remember ho
Machine model names untranslated rahen
Technical words context ke saath
Mixed Hinglish acceptable where audience expects it
Admin-generated notifications language-aware hon
Do not machine-translate technical specifications without review.

78. Microcopy Guidelines
Tone:
Direct
Simple
Respectful
Action-oriented
Examples:
Instead of:
“Your request has been successfully initiated.”
Use:
“Refund request submit ho gaya.”
Instead of:
“Kindly proceed with document resubmission.”
Use:
“PAN card dobara upload karein.”

79. Button Labels
Use action labels:
View Details
Reveal Number
Call Dealer
WhatsApp
Send Enquiry
Add Listing
Submit for Approval
Save Draft
Upload Again
Mark as Sold
Request Refund
Avoid vague labels:
Continue
Click Here
Proceed
Submit
“Continue” step-based forms me acceptable hai, lekin context visible hona chahiye.

80. Confirmation Dialogs
Confirmation only destructive/critical actions:
Delete draft
Mark sold
Request refund
Suspend partner
Reject KYC
Permanently purge media
Close account
Routine actions par confirmation popup mat use karein.

81. Accessibility Guide
Minimum requirements:
Keyboard navigation
Visible focus
Semantic HTML
Proper labels
Alt text
Color contrast
Error text
Screen-reader friendly status
Buttons minimum 44×44 px
Captions/transcripts where possible
No color-only communication
Reduced-motion support

82. SEO-Friendly UI Requirements
UI decisions:
Main content server-rendered
Proper H1
Logical H2/H3
Crawlable links
Text not hidden inside images
Filter URLs controlled
Breadcrumbs visible
Pagination crawlable
Sold listing status visible
Image alt text generated
Video details available in text
Client-only blank listing pages SEO ko destroy karenge.

83. Performance UX
Design should support:
Compressed images
Lazy loading
Image placeholders
Limited homepage sections
No autoplay media
Reduced animation
Code splitting
Fast search response
Optimistic favourite action
Background uploads
Heavy hero videos and oversized carousels avoid karein.

84. Design Components Library
Core components:
Navigation
Header
Mobile header
Sidebar
Bottom navigation
Breadcrumb
Tabs
Inputs
Text input
Mobile input
OTP input
Select
Multi-select
Searchable dropdown
Checkbox
Radio
Toggle
Date picker
Price input
Location picker
Upload control
Marketplace
Listing card
Dealer card
Price block
Specification row
Verification badge
Status badge
Contact bar
Gallery
Video player
Compare item
Feedback
Alert
Toast
Modal
Drawer
Bottom sheet
Empty state
Error state
Skeleton
Progress bar
Dashboard
Stat card
Data table
Filter bar
Activity timeline
Lead card
Approval panel
Audit log
Chart card

85. Design Token System
Define tokens for:
Colors
Typography
Spacing
Radius
Shadows
Border
Z-index
Breakpoints
Motion
Icon size
Components hard-coded random values use na karein.

86. Figma File Structure
Recommended Figma pages:
Cover and documentation
Foundations
Components
Public website
Customer flows
Partner onboarding
Partner dashboard
Admin dashboard
Responsive screens
Prototype flows
Developer handoff
Archive

87. Figma Component Requirements
Every reusable component me variants:
Default
Hover
Focus
Active
Disabled
Loading
Error
Success
Examples:
Listing card variants:
Default
Featured
Reserved
Sold
Loading
Button variants:
Primary
Secondary
Outline
Ghost
Danger
WhatsApp

88. Prototype Flows
At minimum Figma prototype me:
Customer
Homepage → Search → Listing → Login → Contact
Partner
Register → KYC → Deposit → Approval → Add listing
Listing
Draft → Submit → Changes requested → Resubmit → Published
Lead
New lead → Contact → Follow-up → Won
Sold
Published → Reserved → Sold → Media deletion scheduled
Refund
Exit request → Eligibility → Finance review → Paid

89. UX Research and Testing
Before final UI lock:
Test with:
5 customers
3 dealers/brokers
2 admin operators
Key tests:
Search a JCB in a city
Contact dealer
Save search
Register partner
Upload KYC
Add listing from mobile
Correct rejected listing
Mark machine sold
Process refund
Review listing as admin
Observe completion, not opinions only.

90. Important UX Metrics
Track:
Search-to-listing click rate
Listing-to-contact rate
Login completion
OTP failure
Enquiry completion
Partner registration completion
KYC completion time
Listing creation drop-off
Image upload failure
Listing approval correction rate
Lead response time
Saved alert activation
PWA installation
Refund request completion

91. MVP UI Screens
Public
Homepage
Search results
Listing detail
Dealer profile
Login
Registration
Blog
Location page
Model page
Customer
Dashboard
Saved listings
Saved searches
Enquiries
Notifications
Profile
Privacy settings
Partner
Registration
OTP
Business profile
KYC
Deposit
Agreement
Application status
Dashboard
Add listing
Listings
Leads
Analytics
Exit/refund
Admin
Login
Dashboard
Partner queue
KYC review
Deposit review
Listing approval
Listing management
Lead management
Refund management
Media deletion
Complaints
CMS
SEO
Settings
Audit logs

92. UI Priorities by Phase
Phase 1
Public website
Search
Listing page
Contact flow
Customer login
Partner onboarding
Listing form
Admin approval
Lead dashboard
Sold flow
Refund flow
Phase 2
Compare
Dealer profiles
Advanced analytics
Reviews
Inspection
Bulk listing
Hindi interface
Advanced alerts
Phase 3
AI search
Price intelligence
Native app
Advanced dealer CRM
Automated KYC
Inspection network

93. Common Design Mistakes to Avoid
Homepage ko banners aur sliders se bharna
Browse karne ke liye login force karna
Listing card par too much information
Mobile par desktop tables dikhana
Long partner registration single page me banana
Rejection reason generic rakhna
Call aur WhatsApp CTA hide karna
Status sirf color se show karna
Admin dashboard me operational queues hide karna
Every listing ke liye SMS permission assume karna
Huge image uploads without progress
Sold listing silently remove karna
Refund deductions unclear rakhna
Too many popups
Fancy animation ke chakkar me speed ruin karna

94. Recommended UX Decisions
Public browsing without login
Contact reveal after mobile verification
Mobile sticky Call and WhatsApp buttons
Partner onboarding stepper
Listing creation multi-step form
Required photo slots instead of generic uploader
Exact admin correction notes
Old live listing version during pending edits
Saved-search-based alerts
Sold page retained with alternatives
Refund amount and deduction transparency
Admin queues before analytics charts
PWA before native app

95. Final Navigation Structure
Public Navigation
Home
Browse JCBs
Categories
Locations
Dealers
Buyer Guides
Partner Registration
Login
Customer Navigation
Dashboard
Saved Listings
Saved Searches
Enquiries
Notifications
Profile
Partner Navigation
Dashboard
Listings
Add Listing
Leads
Analytics
Team
KYC and Deposit
Support
Settings
Admin Navigation
Dashboard
Partners
KYC
Listings
Leads
Customers
Finance
Refunds
Complaints
Notifications
Media Jobs
CMS
SEO
Reports
Audit Logs
Settings

96. Final Mobile Listing Page Structure
Header
↓
Image gallery
↓
Status badges
↓
Listing title
↓
Price
↓
Year • Hours • Condition
↓
Location
↓
Call / WhatsApp sticky bar
↓
Overview
↓
Specifications
↓
Video
↓
Inspection and finance
↓
Dealer information
↓
Safety tips
↓
Similar listings
↓
Footer


97. Final Partner Listing Flow Structure
Select Category
↓
Model and Identification
↓
Specifications
↓
Price and Location
↓
Photos
↓
Video and Documents
↓
Contact Preference
↓
Preview
↓
Declaration
↓
Submit for Approval


98. Final Admin Review Structure
Pending Queue
↓
Open Listing
↓
Review Partner Status
↓
Review Details and Media
↓
Check Duplicate/Fraud Warnings
↓
Select Contact Mode
↓
Approve / Request Changes / Reject
↓
Add Notes
↓
Notify Partner


99. Final Design Deliverables
Designer ko following outputs dene chahiye:
Sitemap
User flows
Low-fidelity wireframes
Design system
Component library
Responsive high-fidelity screens
Clickable prototypes
Form validation states
Empty and error states
Loading states
Role-based dashboards
Developer specifications
Icon and asset library
Content/microcopy sheet
Accessibility checklist
Responsive behavior documentation

100. Final UX Standard
Platform ka UX successful tab maana jayega jab:
Customer 30 seconds ke andar relevant listings tak pahunch sake
Customer 2–3 actions me dealer/admin se contact kar sake
New partner onboarding status clearly samajh sake
Dealer mobile se listing submit kar sake
Admin listing ko efficiently review kar sake
Rejection ka exact correction visible ho
Sold listing lifecycle predictable ho
Refund calculation transparent ho
Important screen slow network par bhi usable ho
Har critical status clearly communicate ho

