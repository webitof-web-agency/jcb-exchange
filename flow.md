JCB Exchange Platform
Complete End-to-End Flow Document

1. Platform ka Overall Flow
Platform ka primary flow:
Visitor website par aata hai
        ↓
Location/model/category ke basis par listings browse karta hai
        ↓
Listing detail page open karta hai
        ↓
Call, WhatsApp ya enquiry karne ke liye login karta hai
        ↓
System contact visibility rules check karta hai
        ↓
Dealer ya admin ka contact show hota hai
        ↓
Customer action se lead create hoti hai
        ↓
Dealer/admin lead par follow-up karta hai
        ↓
Inspection, negotiation aur finance process hota hai
        ↓
Vehicle reserved ya sold mark hota hai
        ↓
Sold listing par enquiry disable hoti hai
        ↓
30 din baad gallery aur videos delete hote hain
        ↓
Featured image aur listing data retain hota hai

Partner-side primary flow:
Partner registration
        ↓
Mobile/email verification
        ↓
Business profile
        ↓
KYC documents
        ↓
Security deposit ya letter
        ↓
Agreement acceptance
        ↓
Admin verification
        ↓
Partner approval
        ↓
Listing creation
        ↓
Listing admin approval
        ↓
Listing publication
        ↓
Lead management
        ↓
Vehicle reserved/sold
        ↓
Media deletion lifecycle
        ↓
Partner exit and deposit refund


2. User Roles Flow
Platform me following major roles rahenge:
2.1 Visitor
Visitor bina login:
Homepage dekh sakega
Listing search kar sakega
Filters use kar sakega
Listing detail page dekh sakega
Photos aur videos dekh sakega
Price, model, year aur approximate location dekh sakega
SEO location aur model pages access kar sakega
Blog aur buying guides padh sakega
Partner registration page access kar sakega
Visitor following actions ke liye login karega:
Phone number reveal
Direct call
WhatsApp
Enquiry
Favourite
Saved search
Alert creation
Dealer follow
Inspection request
Finance request

2.2 Customer
Customer:
OTP, Google ya email se login karega
Listings browse karega
Contact reveal karega
Call ya WhatsApp karega
Enquiry submit karega
Listings favourite aur compare karega
Saved searches aur alerts create karega
Inspection aur finance request karega
Enquiry history track karega

2.3 Partner
Partner types:
Dealer
Broker
Agent
Dealer company
Fleet owner
Recovery partner
Partner:
Registration karega
KYC submit karega
Security deposit ya letter submit karega
Admin approval lega
Listings add karega
Leads manage karega
Vehicle reserved ya sold mark karega
Exit aur refund request submit karega

2.4 Admin
Admin roles:
Super admin
KYC reviewer
Partner approval admin
Listing reviewer
Lead manager
Finance admin
Support executive
SEO manager
Content manager
Har admin role ke paas limited permissions hongi.

3. Partner Registration Flow
Step 1: Partner Registration Page
Partner dedicated page open karega:
/partner/register
/dealer-registration
/broker-registration
/agent-registration

Partner type select karega:
Dealer
Broker
Agent
Company
Fleet owner
Basic details:
Full name
Business name
Mobile number
WhatsApp number
Email
State
District
City
PIN code
Business experience
Expected monthly listings
Referral code
Password, where applicable

Step 2: Mobile Verification
Partner mobile number enter karega.
System:
Mobile number validate karega
Duplicate mobile check karega
OTP send karega
OTP expiry set karega
Wrong OTP attempt track karega
Successful verification ke baad next step open karega
Possible conditions:
Mobile already registered
Mobile blocked
OTP expired
Too many OTP requests
Invalid OTP
Verification successful

Step 3: Email Verification
Partner email enter karega.
System:
Duplicate email check karega
Email OTP ya verification link send karega
Email verified status save karega
Mobile verification mandatory aur email verification configurable ho sakti hai.

Step 4: Registration Draft Creation
Mobile verify hone ke baad system partner application create karega.
Application status:
Registration Incomplete

Partner ko unique application ID milega.
Example:
PARTNER-2026-00125

Partner registration incomplete chhodne par later login karke resume kar sakega.

4. Partner Business Profile Flow
Partner business profile complete karega.
Required Information
Business name
Owner name
Partner type
Business address
State
District
City
PIN code
Office location
Google Maps coordinates
Years in business
Service locations
Working hours
Primary contact
Alternate contact
WhatsApp number
Business description
GST number, where applicable
Company registration number
Website
Social profile
Business logo

Profile Completion Logic
System completion percentage calculate karega.
Example:
Basic details: 20%
Address: 20%
Business details: 20%
KYC: 25%
Deposit: 10%
Agreement: 5%

Application tab tak submit nahi hogi jab tak mandatory sections complete na hon.

5. Partner KYC Flow
Step 1: Partner Type ke Basis par Documents
Individual Partner
PAN
Aadhaar ya accepted ID
Address proof
Passport-size photo
Selfie
Bank account proof
Cancelled cheque
Signature
Business Partner
Company PAN
GST certificate
Business registration
Shop registration
Incorporation certificate
Partnership deed
Authorized person ID
Office address proof
Bank proof
Cancelled cheque
Authorization letter
Company stamp and signature

Step 2: Document Upload
Har document ke liye:
Document type select
File upload
Document number enter
Issue date
Expiry date
Name as per document
Remarks
System check karega:
Valid file type
Valid file size
Virus or malware
Blurry image
Duplicate file
Required pages
Expired document
Missing document number

Step 3: KYC Submission
All mandatory documents complete hone par partner:
Submit KYC

select karega.
KYC status:
KYC Submitted

Submission ke baad documents directly edit nahi honge. Partner ko correction request ka wait karna hoga.

Step 4: KYC Admin Review
KYC reviewer dashboard me application open karega.
Admin check karega:
Name match
PAN match
Mobile and email
Business identity
Address
Bank account
Document expiry
Duplicate PAN
Duplicate bank account
Duplicate company
Suspicious documents
Existing blocked partner
Har document ka status:
Pending
Approved
Rejected
Re-upload required
Expired
Suspicious

Step 5: KYC Decision
Admin actions:
Approve
KYC status:
KYC Approved

Request Changes
Admin document-wise reason select karega:
Blurry document
Incorrect document
Name mismatch
Expired document
Missing page
Invalid proof
Bank mismatch
Additional proof required
Status:
KYC Changes Requested

Partner rejected document replace karke resubmit karega.
Reject
Serious problem hone par:
KYC Rejected

Reason mandatory hoga.
Flag for Investigation
Suspected fraud hone par:
KYC Under Investigation

Is status me onboarding temporarily blocked rahega.

6. Security Deposit Flow
KYC submit hone ke baad partner security deposit section complete karega.
Deposit Options
Option A: Online Payment
Partner:
Deposit amount dekhega
Payment mode select karega
Payment gateway par jayega
Payment karega
System transaction verify karega
Receipt generate hogi
Statuses:
Payment Initiated
Payment Successful
Payment Failed
Payment Pending
Payment Verification Required


Option B: Bank Transfer
Partner:
Bank details dekhega
Transfer karega
Transaction reference enter karega
Date enter karega
Receipt upload karega
Finance admin payment verify karega.

Option C: Offline Payment
Partner ya admin:
Payment mode
Amount
Receipt number
Payment date
Supporting document
enter karega.
Finance approval mandatory hoga.

Option D: Letter or Guarantee
Partner upload kar sakega:
Security-deposit waiver letter
Bank guarantee
Company undertaking
Signed contractual letter
Admin-approved exemption request
Required data:
Letter type
Issue date
Expiry date
Issuing organization
Reference number
Uploaded document
Admin approve ya reject karega.

Deposit Verification
Finance admin check karega:
Amount
Transaction ID
Bank settlement
Partner identity
Receipt
Duplicate transaction
Guarantee validity
Letter authenticity
Deposit status:
Not Submitted
Submitted
Verification Pending
Verified
Rejected
Letter Approved
Letter Rejected
Expired


7. Agreement Acceptance Flow
Partner ko required agreements show honge.
Partner:
Agreement open karega
Complete document read karega
Mandatory checkboxes accept karega
Digital confirmation karega
OTP ya password se acceptance confirm karega
System store karega:
Agreement ID
Version
Acceptance date
IP address
Device details
Partner ID
Consent status
Future me agreement update hone par re-acceptance required ho sakti hai.

8. Final Partner Approval Flow
Application final review queue me tab jayegi jab:
Mobile verified
Email verified, if mandatory
Business profile complete
KYC submitted
Deposit or letter submitted
Agreement accepted
Application status:
Partner Review Pending


Admin Final Review
Admin check karega:
Profile details
KYC result
Deposit status
Agreement acceptance
Risk flags
Service locations
Business credibility
Expected listing volume
Previous account history
Customer complaints, if existing
Internal verification notes

Admin Decision
Fully Approved
Partner status:
Approved

Partner ko dashboard access milega.
Approved with Restrictions
Restrictions:
Maximum listing count
Admin contact only
No public dealer profile
Every listing manual review
No bulk upload
Limited locations
Temporary approval period
Status:
Approved with Restrictions

Changes Requested
Partner ko missing information update karni hogi.
Rejected
Partner listing create nahi kar sakega.
Suspicious or Blocked
Fraud ya duplicate account hone par account block hoga.

Approval ke Baad Automatic Actions
System:
Partner ID generate karega
Dashboard activate karega
Listing quota assign karega
Default contact rule assign karega
Account manager assign karega
Welcome SMS/email/WhatsApp send karega
Partner onboarding checklist show karega
Audit log create karega

9. Partner Dashboard First-Time Flow
First login par partner ko onboarding checklist milegi:
Profile complete
KYC approved
Deposit verified
Agreement accepted
Contact preference set
First listing create

Dashboard me:
Application status
KYC status
Deposit status
Listing limit
Active listings
Pending listings
Leads
Notifications
Support
Account manager
show hoga.

10. Listing Creation Flow
Partner dashboard se:
Add New Listing

select karega.
System new listing ID create karega.
Initial status:
Draft


Step 1: Category Selection
Partner equipment category select karega:
Backhoe loader
Excavator
Wheel loader
Telehandler
Skid steer
Compactor
Crane
Tractor
Other equipment
Category ke basis par form fields dynamically change honge.

Step 2: Brand, Model and Variant
Partner select karega:
Brand
Model
Variant
Manufacturing year
Registration year
Admin-managed master data use hoga.
Model unavailable hone par partner:
Request New Model

submit kar sakega.
Admin approval ke baad model list me add hoga.

Step 3: Vehicle Identification
Fields:
Registration number
Chassis number
Serial number
Engine number
Ownership type
Previous owners
Vehicle condition
Usage type
System duplicate check karega:
Same registration
Same chassis
Same serial
Same dealer duplicate
Other dealer duplicate
Previously sold listing
Duplicate suspicion hone par warning show hogi.

Step 4: Technical Specifications
Category-based fields:
Operating hours
Engine power
Engine condition
Hydraulic condition
Transmission
Tyre condition
Battery condition
Cabin condition
AC or non-AC
Bucket capacity
Digging depth
Loader capacity
Attachments
Major repairs
Accident history
Service records
Meter replacement
Partner unknown field ke liye:
Not Available

select kar sakega, lekin critical fields mandatory rahenge.

Step 5: Price Details
Partner enter karega:
Asking price
Negotiable
Fixed price
Price on request
GST applicable
GST included or excluded
Finance available
Exchange accepted
Transport available
Loan outstanding
Hypothecation
System price validation karega:
Zero price
Unrealistic low price
Unrealistic high price
Invalid currency
Price mismatch
Missing price-on-request flag

Step 6: Location
Partner location enter karega:
State
District
City
Area
PIN code
Yard address
Landmark
Map location
Partner choose karega:
Exact address public
Approximate location public
Address private
Admin later override kar sakega.

Step 7: Listing Description
Partner provide karega:
Vehicle summary
Current condition
Key benefits
Known issues
Repairs required
Maintenance history
Inspection availability
Included attachments
Reason for sale
Additional conditions
System detect karega:
Mobile numbers
WhatsApp numbers
External URLs
Abusive language
Misleading promises
Competitor marketplace references
Restricted content remove ya flag hoga.

11. Listing Image Upload Flow
Partner minimum required images upload karega.
Suggested sequence:
Front view
Rear view
Left side
Right side
Cabin
Engine
Tyres
Meter
Serial plate
Attachment
Damage area
Featured image

Image Processing
Upload ke baad system:
File validate karega
Virus scan karega
Image resolution check karega
Blur detection karega
Duplicate image check karega
External watermark detect karega
EXIF metadata remove karega
Image compress karega
WebP/AVIF variants banayega
Platform watermark lagayega
CDN par upload karega
Thumbnail create karega
Failed image par retry option milega.

Featured Image
Partner featured image choose karega.
Admin listing approval ke waqt featured image:
Accept
Replace
Reorder
Reject
kar sakega.
Featured image sold-media purge ke baad retain ki ja sakti hai.

12. Listing Video Upload Flow
Partner options:
Direct upload
YouTube URL
Vimeo URL
Cloud-hosted video
Video types:
Walkaround
Engine start
Machine working
Hydraulic test
Cabin
Damage

Direct Upload Processing
System:
File type check karega
File size check karega
Duration check karega
Malware scan karega
Video transcode karega
Multiple resolutions banayega
Streaming file create karega
Thumbnail generate karega
Watermark apply karega
CDN upload karega
Processing status:
Uploading
Processing
Ready
Failed
Rejected

Listing tab tak submit ho sakti hai jab video optional ho. Mandatory video hone par processing complete required hogi.

13. Vehicle Documents Flow
Partner private documents upload karega:
RC
Insurance
Invoice
NOC
Fitness
Permit
Loan closure
Ownership proof
Inspection report
Service record
Visibility options:
Admin only
Dealer and admin
Verified customer on request
Public summary only
Documents public URL par directly accessible nahi honge.

14. Contact Preference Flow
Partner listing-level preference choose karega:
Show dealer number
Show admin number
Show WhatsApp only
Enquiry form only
Use profile default
Yeh sirf preference hogi. Final decision admin aur platform rules lenge.

15. Listing Preview and Declaration Flow
Submit karne se pehle partner preview dekhega:
Mobile preview
Desktop preview
Search card preview
Listing page preview
Contact preview
SEO title preview
Partner declarations accept karega:
Data correct hai
Machine legally sellable hai
Media use karne ka right hai
Documents genuine hain
Known issues disclose kiye gaye hain
Duplicate listing nahi hai

16. Listing Submission Flow
Partner:
Submit for Approval

select karega.
System mandatory-field validation karega.
Agar incomplete:
Listing Incomplete

Agar complete:
Submitted

Listing partner ke liye temporarily locked ho jayegi.

17. Automated Listing Review Flow
Admin queue se pehle automated checks chalenge.
System Checks
Partner approved hai
KYC valid hai
Deposit valid hai
Listing quota available hai
Required fields complete hain
Valid model and year
Duplicate registration
Duplicate chassis
Duplicate serial
Duplicate image
Previous sold record
Required media complete
Valid price
Contact details description me nahi
External links nahi
Prohibited content nahi
Video working hai
Location valid hai

Automated Result
Passed
Status:
Admin Review Pending

Warning
Listing admin queue me jayegi with warning.
Failed
Status:
Automated Check Failed

Partner ko correction list milegi.

18. Admin Listing Review Flow
Listing reviewer dashboard me listing open karega.
Review screen me:
Complete listing
Partner details
Partner status
KYC status
Deposit status
Risk flags
Images
Videos
Documents
Duplicate results
Price information
Contact preference
SEO preview
Previous rejections
Internal notes

Admin Review Decisions
Approve
Admin set karega:
Contact mode
Listing expiry date
Featured or normal
Verification badge
Notification eligibility
Publish immediately or schedule
Status:
Approved

Request Changes
Admin structured reasons select karega:
Incorrect price
Wrong year
Missing images
Poor image quality
Invalid documents
Duplicate listing
Description correction
Video required
Wrong location
Contact preference unavailable
Status:
Changes Requested

Partner corrections karke resubmit karega.
Reject
Serious issue:
Fraud
Fake documents
Duplicate vehicle
Prohibited vehicle
No authority to sell
Stolen equipment suspicion
Repeated false information
Status:
Rejected

Suspend for Investigation
Status:
Listing Under Investigation

Listing public nahi hogi.

19. Listing Publishing Flow
Admin approval ke baad system automatically:
Public listing URL generate karega
SEO slug create karega
Meta title create karega
Meta description create karega
Structured data create karega
Listing search index me add karega
Sitemap update karega
Similar listings calculate karega
Notification audience calculate karega
Social-sharing preview banayega
Dealer ko notification bhejega
Analytics tracking activate karega
Final status:
Published


Example URL
/used-jcb/uttar-pradesh/lucknow/jcb-3dx-2021/JCBX-1025

Listing title change hone par bhi unique listing ID stable rahega.

20. Homepage Discovery Flow
Customer homepage par following options use karega:
Search by city
Search by model
Search by category
Search by price
Nearby listings
Latest listings
Featured listings
Verified listings
Popular cities
Popular models
Price-drop listings
Customer kisi listing card par click karega aur listing detail page open hogi.

21. Customer Search Flow
Customer keyword ya filter use karega.
Example searches:
Lucknow me JCB 3DX
2021 ke baad ki JCB
15 lakh ke under used JCB
Low hour excavator near Delhi

System:
Query normalize karega
Hindi/English words identify karega
Location detect karega
Model detect karega
Price filters detect karega
Search results return karega

Search Filters
Category
Brand
Model
Variant
State
District
City
Radius
Price range
Year
Operating hours
Condition
Ownership
Verified listing
Verified dealer
Finance available
Inspection available
Video available
Negotiable
Featured
Available or sold

Search Result Interaction
Customer:
Grid view
List view
Map view
Sort
Favourite
Compare
Share
Quick enquiry
Save search
use kar sakega.

22. Customer Login Flow
Customer contact action select karega.
Agar login nahi hai, login modal ya page open hoga.
Options:
Mobile OTP
Email OTP
Google login

Mobile OTP Flow
Mobile number enter
Consent accept
OTP send
OTP enter
OTP verify
Customer profile create
Original listing/action par redirect
New customer se initial minimum data liya jayega:
Name
Mobile
City
Additional profile later progressively collect hoga.

Google Login Flow
Google sign-in
Email and name receive
Customer account match/create
Mobile verification required before contact reveal
Original action resume
Google login alone phone contact abuse rokne ke liye enough nahi hoga; mobile OTP required kiya ja sakta hai.

23. Listing Detail Page Flow
Customer listing page par dekhega:
Featured image
Gallery
Video
Price
Year
Model
Variant
Operating hours
Condition
Location
Ownership
Specifications
Description
Dealer badge
Listing badge
Published date
Similar listings
Safety instructions
Primary CTAs:
Reveal number
Call now
WhatsApp
Send enquiry
Request callback
Book inspection
Request documents
Make price offer
Finance request
Favourite
Compare
Report listing

24. Contact Visibility Decision Flow
Customer phone ya WhatsApp button click karega.
System following order me rules check karega.
Rule 1: Listing Status
Agar listing:
Sold
Suspended
Expired
Under investigation
hai, contact disable ya restricted hoga.

Rule 2: Listing-Level Admin Override
Check:
Dealer contact
Admin contact
Both contacts
WhatsApp only
Enquiry only
Contact disabled
Listing-level admin override highest priority hogi.

Rule 3: Dealer-Level Admin Permission
Dealer setting:
Public contact allowed
Public contact blocked
Admin number only
Call tracking only
Manual decision per listing

Rule 4: Dealer Preference
Dealer preference:
Number public
Number private
WhatsApp only
Admin contact preferred

Rule 5: Platform Default
Agar koi specific rule nahi:
Admin Contact

ya configured default apply hoga.

Final Logic Examples
Case 1
Dealer public + admin allowed:
Dealer contact show

Case 2
Dealer private:
Admin contact show

Case 3
Dealer public but admin blocked:
Admin contact show

Case 4
Listing-level form only:
Phone and WhatsApp hidden
Enquiry form visible

Case 5
Dealer suspended:
Dealer number hidden
Admin number or enquiry form


25. Phone Reveal Flow
Customer:
Reveal Phone Number

click karega.
System check karega:
Logged in
Mobile verified
Listing active
Contact reveal limit
Suspicious device
Suspicious IP
Bot activity
Consent
Successful hone par:
Number reveal hoga
Lead/activity record create hoga
Listing analytics update hogi
Dealer/admin dashboard par event show hoga
Event type:
Phone Reveal

Repeated reveal same customer aur listing ke liye duplicate lead create nahi karega; existing lead activity update hogi.

26. Call Flow
Customer:
Call Now

click karega.
Depending on configuration:
Direct dealer number
Direct admin number
Masked call number
Cloud telephony number
System track karega:
Customer ID
Listing ID
Dealer ID
Call click time
Contact shown
Device
Campaign source
Cloud telephony available hone par:
Call connected
Call duration
Missed call
Call recording consent
Call outcome
track ho sakta hai.

27. WhatsApp Flow
Customer WhatsApp click karega.
System final WhatsApp number decide karega.
Pre-filled message:
Namaste, mujhe Listing ID JCBX-1025,
2021 JCB 3DX ke baare me information chahiye.

Listing:
[Listing URL]

System:
WhatsApp click track karega
Lead create/update karega
Dealer/admin ko attribution dega
Customer consent store karega

28. Enquiry Form Flow
Customer enquiry form open karega.
Fields:
Name
Mobile
Email
City
Message
Budget
Purchase timeline
Preferred call time
Finance required
Consent
Customer enquiry type choose karega:
General enquiry
Price enquiry
Callback request
Inspection
Finance
Documents
Additional photos
Transport
Submission ke baad:
Form validate
Customer verify
Lead create
Dealer/admin assignment
Notification send
Confirmation show
Customer enquiry history update

29. Lead Creation Logic
Lead create hogi jab customer:
Phone reveal kare
Call click kare
WhatsApp click kare
Enquiry submit kare
Inspection request kare
Finance request kare
Price offer bheje
Documents request kare

Duplicate Lead Logic
Same customer + same listing ke existing active lead hone par:
New lead create nahi hogi
Existing lead me new activity add hogi
Lead priority update ho sakti hai
Different listing ke liye separate lead create hogi.

30. Lead Assignment Flow
System lead assign karega based on contact mode.
Dealer Contact Mode
Lead assigned to:
Dealer

Dealer company hone par:
Dealer owner
Assigned sales executive
Round robin staff

Admin Contact Mode
Lead assigned to:
Admin Sales Team

Admin lead later relevant dealer ya agent ko assign kar sakta hai.

Location-Based Assignment
Lead:
State
District
City
PIN code
ke basis par assigned ho sakti hai.

Round-Robin Assignment
Available sales users me equal distribution hoga.

31. Dealer Lead Management Flow
Dealer dashboard me new lead notification show hogi.
Dealer lead open karega.
Lead data:
Customer name
Mobile
Listing
Enquiry source
Message
City
Budget
Purchase timeline
Activity timeline
Dealer actions:
Mark viewed
Call customer
WhatsApp
Add note
Assign staff
Set follow-up
Change status
Mark invalid
Mark spam
Mark won/lost

Lead Status Flow
New
 ↓
Assigned
 ↓
Viewed
 ↓
Contacted
 ↓
Qualified
 ↓
Interested
 ↓
Inspection Scheduled
 ↓
Negotiation
 ↓
Won or Lost

Alternative outcomes:
Invalid
Duplicate
Spam
No response
Finance pending

32. Lead Follow-Up Flow
Dealer follow-up date and time set karega.
System:
Dealer ko reminder bhejega
Overdue follow-up highlight karega
Admin ko delayed response report dega
Customer activity track karega
Admin monitor kar sakega:
First response time
Total follow-ups
Lead ageing
Lead status
Dealer response rate

33. Customer Favourite Flow
Customer favourite icon click karega.
System:
Listing customer favourites me save karega
Duplicate favourite prevent karega
Listing favourite count update karega
Customer ko future alerts:
Price changed
Listing reserved
Listing sold
Listing expiring
Similar listing added
Customer favourite remove kar sakta hai.

34. Compare Flow
Customer multiple listings select karega.
Comparison page par:
Price
Year
Model
Variant
Operating hours
Condition
Location
Ownership
Engine
Hydraulic
Tyres
Attachments
Inspection
Finance
Dealer verification
side-by-side show hoga.
Sold ya unavailable listing clearly marked hogi.

35. Saved Search and Alert Flow
Customer search filters set karega.
Example:
Model: JCB 3DX
Location: Uttar Pradesh
Price: ₹10–18 lakh
Year: 2020 onwards

Customer:
Save Search

select karega.
Alert frequency:
Instant
Daily
Weekly
Off
Channels:
Push
WhatsApp
SMS
Email
In-app

36. New Listing Notification Flow
New listing publish hone par system:
Listing notification eligibility check karega
Matching saved searches find karega
Customer preferences check karega
Consent check karega
Quiet hours check karega
Frequency cap check karega
Notification queue create karega
Channel provider ko send karega
Delivery status record karega

Matching Logic
Match based on:
Category
Brand
Model
Location
Radius
Price
Year
Operating hours
Condition
Har customer ko har listing ka SMS nahi bheja jayega.

Notification Content
Featured image
Listing title
Price
Location
Year
Listing URL
View details CTA
Unsubscribe option

37. PWA Installation Flow
Customer browser me platform visit karega.
Supported browser me install prompt show hoga.
Customer:
Install JCB Exchange

select karega.
PWA features:
Home-screen icon
Splash screen
App-like navigation
Push notifications
Cached recently viewed listings
Offline fallback
Background form sync
Deep links
Share listing
Notification permission install ke turant baad force nahi karni chahiye. User action ke context me permission maangi jayegi.

38. Listing Edit Flow
Partner published listing edit karega.
Fields do categories me honge.
Minor Fields
Spelling
Small description correction
Working hours
Optional details
Minor changes direct publish ho sakte hain.

Critical Fields
Price
Model
Variant
Manufacturing year
Registration number
Serial number
Chassis number
Location
Ownership
Featured image
Contact preference
Major condition details
Critical change par:
Current listing live version retained rahega
Edited version pending review me jayega
Admin review karega
Approval ke baad new version publish hoga
Ya configuration ke according listing temporarily unpublished ki ja sakti hai.

39. Listing Expiry Flow
Har listing ki expiry date hogi.
Expiry se pehle notifications:
7 days before
3 days before
1 day before
Partner actions:
Renew
Update
Mark sold
Pause
Expiry par:
Expired

Contact disabled ho sakta hai.
Partner renew request submit karega. Admin approval configurable hoga.

40. Listing Pause Flow
Partner listing temporarily pause kar sakta hai.
Reasons:
Vehicle unavailable
Negotiation ongoing
Documentation pending
Maintenance
Other
Paused listing:
Search results se hide ho sakti hai
Direct URL par paused status show ho sakta hai
Contact disable hoga
SEO page temporarily retained rahega
Partner later resume kar sakta hai.

41. Reserved Listing Flow
Dealer vehicle reserved mark karega.
Required data:
Reservation date
Reservation expiry date
Customer reference, optional
Token status, future
Reason
Notes
Listing status:
Reserved

Public page par:
Reserved badge
Contact limited ya active
Similar available listings
Enquiry form configuration
Reservation expiry ke baad:
Auto available
Manual extension
Convert to sold

42. Sold Listing Flow
Dealer ya admin:
Mark as Sold

select karega.
Required fields:
Sold date
Sold through platform: yes/no
Lead reference, if applicable
Buyer source
Sold price, optional/private
Sale proof, optional
Remarks

Sold Confirmation
System confirmation show karega:
Sold mark karne ke baad contact actions disable ho jayenge.
Media 30 din baad deletion ke liye scheduled hoga.

Partner confirm karega.

Sold Status ke Baad
System:
Listing status sold karega
Contact buttons disable karega
New enquiries stop karega
Matching alerts stop karega
Favourite customers ko notify karega
Similar listings show karega
Media deletion date calculate karega
Analytics sale attribution update karega
Status:
Sold


43. Sold Listing Public Page Flow
Sold listing immediately delete nahi hogi.
Page par:
Sold badge
Sold date
Basic details
Featured image
Dealer reference
Similar available listings
Same model alternatives
Same city alternatives
Contact buttons hidden honge.
SEO page retain rahega.

44. Sold Media Retention Flow
Sold date se configurable period, default 30 days:
Gallery visible ya archived rahegi
Videos retained rahenge
Admin restore kar sakta hai
Dealer correction request kar sakta hai
Legal hold apply ho sakta hai
System deletion date show karega.
Example:
Media deletion scheduled: 15 September 2026


45. Automatic Media Deletion Flow
Scheduled job daily run karega.
System find karega:
Sold listings
Retention period complete
Legal hold nahi
Deletion cancelled nahi
Dispute pending nahi
Eligible listing ke liye deletion job create hogi.

Delete Hone Wala Data
Gallery originals
Compressed images
Image variants
Thumbnails
Videos
Video variants
Video thumbnails
Streaming files
Temporary files
CDN cache
Selected private documents

Retain Hone Wala Data
Featured image
Watermarked featured image
Listing title
Specifications
Listing ID
Dealer ID
Sold date
SEO content
Analytics
Leads
Financial records
Audit logs

Deletion Job Result
Success
Status:
Media Purged

System record karega:
Deleted file count
Deleted size
Storage reclaimed
Deletion timestamp
Partial Failure
System:
Retry schedule karega
Admin alert bhejega
Failed files list save karega
Legal Hold
Deletion skip hogi.
Status:
Legal Hold


46. Listing Restore Flow
Sold listing galti se sold mark hui ho to dealer restoration request karega.
Dealer direct sold status reverse nahi karega after configured grace period.
Flow:
Restore request
Reason
Supporting proof
Admin review
Media availability check
Listing reapproval
Listing available/published
Media purge ho chuka hai to gallery restore possible nahi hogi unless recovery policy allow kare.

47. Partner Suspension Flow
Admin partner suspend kar sakta hai.
Reasons:
KYC expired
Deposit expired
Customer complaints
Fraud suspicion
Fake listing
Policy violation
Non-response
Payment dues
Suspension effects:
New listings disabled
Pending listings hold
Published listings hidden or admin-contact mode
Dealer contact hidden
Leads admin ko reassign
Refund blocked
Partner dashboard limited
Admin suspension remove kar sakta hai after resolution.

48. KYC Expiry Flow
Document expiry se pehle notifications:
30 days
15 days
7 days
1 day
Partner updated document upload karega.
Expiry par policy ke according:
Warning only
New listing blocked
Existing listing admin-contact mode
Account suspended
Admin configuration final behavior decide karegi.

49. Deposit or Guarantee Expiry Flow
Guarantee expiry ke pehle reminder hoga.
Partner:
Renew guarantee
Pay security deposit
Upload new letter
Request extension
Expiry par:
New listing disabled
Approval pending
Partner restricted
Existing listings review

50. Partner Exit Flow
Ek saal ya configured lock-in complete hone ke baad partner exit request submit kar sakta hai.
Partner dashboard:
Close Partner Account

select karega.
Required details:
Exit reason
Desired closure date
Refund request
Bank account confirmation
Remarks
Supporting document

51. Exit Eligibility Check
System automatically check karega:
Lock-in complete
No active listings
No reserved listings
No pending listing reviews
No unresolved leads, where required
No customer disputes
No fraud investigation
No unpaid fees
No commission dues
No chargebacks
Notice period complete

Eligibility Failed
Partner ko blockers show honge:
2 active listings close kijiye
1 customer dispute pending hai
₹5,000 platform dues pending hain

Exit request submit nahi hogi ya conditional status me rahegi.

Eligibility Passed
Status:
Exit Requested

Partner new listings create nahi kar sakega.

52. Partner Exit Operational Actions
Exit request ke baad:
Active listings close ya transfer
Pending leads reassign
Dealer contact disable
Team access revoke
Final account statement generate
Finance review start
Refund eligibility calculate

53. Deposit Refund Flow
Finance admin refund request open karega.
Admin check karega:
Original deposit
Deposit payment proof
Partner identity
Bank details
Refundable balance
Deductions
Pending disputes
Contract violations
Tax treatment
Previous adjustments

Refund Calculation
Original deposit
– Outstanding platform fees
– Approved penalties
– Chargebacks
– Commission dues
– Tax deductions
= Final refundable amount

Every deduction ke saath:
Reason
Amount
Evidence
Approval authority
mandatory hoga.

Refund Status Flow
Refund Requested
        ↓
Eligibility Review
        ↓
Finance Review
        ↓
Information Required, if needed
        ↓
Deduction Proposed
        ↓
Approved
        ↓
Processing
        ↓
Paid

Alternative status:
Rejected
Disputed
Cancelled
Partially paid

Refund Payment
Finance admin enter karega:
Refund amount
Payment mode
Transaction ID
Payment date
Bank account
Receipt
System refund receipt generate karega.
Partner ko SMS/email/WhatsApp notification milegi.

54. Partner Account Closure Flow
Refund complete hone ke baad:
Partner status closed
Login read-only ya disabled
Team accounts disabled
Public profile archived
Listings remain historical
Financial records retained
Audit logs retained
KYC data retention policy apply
Customer leads retained according to legal policy
Final status:
Closed


55. Customer Support Flow
Customer ya partner support ticket create karega.
Fields:
Category
Subject
Description
Listing reference
Partner reference
Attachment
Priority
Ticket status:
Open
Assigned
In Progress
Waiting for Customer
Waiting for Partner
Escalated
Resolved
Closed

Admin:
Assign agent
Add internal notes
Request evidence
Suspend listing
Escalate complaint
Resolve ticket

56. Fraud Complaint Flow
Customer listing report karega.
Reasons:
Fake listing
Incorrect details
Stolen machine
Duplicate listing
Wrong price
Dealer unreachable
Payment fraud
Media copyright
Harassment
System complaint create karega.
Admin:
Evidence check
Listing flag
Contact temporarily disable
Partner response request
Legal hold apply
Listing suspend
Partner suspend
Complaint resolve
Serious fraud me security deposit refund block ho sakta hai, subject to contract and law.

57. Admin Dashboard Daily Operational Flow
Admin login ke baad dashboard priority queues dekhega:
Partner applications pending
KYC reviews pending
Deposit verification pending
Listings pending
Changes requested
Fraud flags
New complaints
Refund requests
Media deletion failures
Notification failures
Expiring KYC
Expiring guarantees
Admin role ke basis par relevant queue show hogi.

58. SEO Publication Flow
Listing publish hote hi:
SEO URL
Meta title
Meta description
Canonical URL
Breadcrumb
Structured data
Open Graph image
Sitemap entry
Search indexing
generate hoga.

Sold Listing SEO Flow
Sold listing:
Immediately delete nahi hogi
Sold status schema/page par visible hoga
Similar listings prominently show hongi
Sitemap handling configurable hoga
Long-term low-value sold pages archive ya noindex ho sakti hain

Expired Listing SEO Flow
Expired listing:
Similar alternatives show
Contact disable
404 immediately nahi
Permanent removal hone par redirect ya 410 strategy use ho sakti hai

59. Analytics Event Flow
System following events track karega:
Homepage view
Search
Filter use
Listing impression
Listing view
Gallery interaction
Video play
Phone reveal
Call click
WhatsApp click
Enquiry
Favourite
Compare
Saved search
Notification click
Inspection request
Finance request
Listing sold

Attribution Flow
Lead ke saath:
Source
Medium
Campaign
Search keyword
Landing page
Device
Location
Referrer
store hoga.
Isse admin identify karega ki lead Google, WhatsApp, paid campaign, direct ya notification se aayi.

60. Notification Failure Flow
Notification send hone par delivery statuses:
Queued
Sent
Delivered
Read
Clicked
Failed
Unsubscribed
Blocked

Failure hone par:
Retry
Alternate provider
Alternate channel
Admin report
Configuration ke according apply hoga.
Repeated failure hone par invalid number/email mark kiya ja sakta hai.

61. Data Deletion and Privacy Flow
Customer account delete request karega.
System check karega:
Active disputes
Financial transactions
Legal retention
Open tickets
Customer personal data:
Delete
Anonymize
Retain under legal obligation
kiya jayega.
KYC data normal customer account data se separate policy follow karega.

62. Audit Log Flow
Every critical action log hogi:
Kis user ne action kiya
Kab kiya
Previous value
New value
IP
Device
Reason
Related partner/listing/customer
Critical actions:
KYC approval
Partner approval
Deposit verification
Refund
Listing approval
Contact override
Sold status
Media deletion
Suspension
Role change
Customer data access
Audit logs normal admin edit nahi kar sakega.

63. Core Status Flow Summary
Partner Status
Registration Incomplete
        ↓
OTP Verified
        ↓
KYC Incomplete
        ↓
KYC Submitted
        ↓
Deposit Pending
        ↓
Review Pending
        ↓
Approved
        ↓
Active
        ↓
Suspended / Inactive
        ↓
Exit Requested
        ↓
Refund Processing
        ↓
Closed


Listing Status
Draft
 ↓
Submitted
 ↓
Automated Review
 ↓
Admin Review Pending
 ↓
Changes Requested / Rejected / Approved
 ↓
Published
 ↓
Paused / Reserved
 ↓
Sold
 ↓
Media Deletion Scheduled
 ↓
Media Purged


Lead Status
New
 ↓
Assigned
 ↓
Viewed
 ↓
Contacted
 ↓
Qualified
 ↓
Interested
 ↓
Inspection
 ↓
Negotiation
 ↓
Won / Lost


Refund Status
Requested
 ↓
Eligibility Review
 ↓
Finance Review
 ↓
Approved
 ↓
Processing
 ↓
Paid


64. Important Edge-Case Flows
Same Vehicle Two Dealers List Karen
Duplicate serial/chassis flag
Both listings hold
Ownership proof request
Admin decision
Invalid partner warning
Fraud strike where applicable

Dealer Contact Public but Admin Blocks It
Dealer number hidden
Admin number shown
Lead admin team ko assigned
Dealer preference ignore

Dealer Suspended While Listings Live
Dealer contact hidden
Listings hide ya admin-contact mode
Leads admin ko reassign
New listings blocked

Sold Listing Galti se Mark Hui
Grace period me admin restore
Grace period ke baad restoration request
Media purge hone par missing media warning

Customer Phone Numbers Scrape Kare
Reveal rate limit
CAPTCHA
Device block
Account suspension
IP block
Admin fraud alert

Media Deletion Fail Hui
Automatic retry
Failed-object report
CDN retry
Admin notification
Manual purge option

Refund ke Time Dispute Open Ho
Refund hold
Dispute resolution
Deduction or release decision
Finance approval
Refund resume

KYC Expire Ho Gayi
Reminder
New listing block
Contact restriction
Account suspension based on policy

Price Update ke Baad Reapproval
Old price live ya listing hold
New price admin review
Approval ke baad update
Price history record
Customer price alert

65. Recommended Screen Flow
Public Screens
Homepage
Search results
Location landing page
Model landing page
Listing detail
Dealer public profile
Login/register
Saved search creation
Blog and guides
Partner registration

Customer Screens
Customer dashboard
Profile
Favourites
Compare
Saved searches
Notifications
Enquiry history
Inspection requests
Finance requests
Privacy settings

Partner Screens
Partner registration
OTP verification
Business profile
KYC upload
Deposit/letter
Agreement
Application status
Partner dashboard
Add listing
Listing preview
Listing status
Lead management
Analytics
Team management
Exit and refund

Admin Screens
Admin dashboard
Partner applications
KYC review
Deposit verification
Listing approval
Listing management
Lead management
Customer management
Complaint management
Refund management
Media deletion queue
Notification management
SEO management
CMS
Analytics
Audit logs
Settings

66. MVP Complete Flow
MVP me following flow fully functional hona chahiye:
Partner registers
→ KYC submits
→ Deposit/letter submits
→ Admin approves
→ Partner creates listing
→ Images/video uploads
→ Admin approves listing
→ Listing publishes
→ Customer searches
→ Customer logs in
→ Contact rule executes
→ Customer calls/WhatsApps/enquires
→ Lead creates
→ Dealer/admin follows up
→ Vehicle reserved/sold
→ Contact disables
→ 30-day deletion scheduler runs
→ Partner exit request
→ Deposit refund process


67. Final Non-Negotiable Business Rules
Customer listing create nahi karega.
Sirf approved partner listing add karega.
KYC approval ke bina partner activate nahi hoga.
Deposit ya approved letter ke bina full approval nahi hoga.
Har listing admin review ke baad publish hogi.
Admin contact visibility par final control rakhega.
Dealer public/private preference de sakta hai.
Customer listing publicly browse kar sakega.
Contact reveal ke liye login aur mobile verification hoga.
Har contact action lead/activity create karega.
Har customer ko har new listing ka SMS nahi jayega.
Notifications matching preference aur consent ke basis par jayengi.
Sold listing par contact immediately disable hoga.
Sold listing ka gallery/video 30 din baad delete hoga.
Featured image policy ke according retain hogi.
Legal hold hone par media deletion nahi hogi.
Refund eligibility verified process se determine hogi.
Security deposit ko refundable liability ke roop me track kiya jayega.
Critical listing edit ke baad reapproval mandatory hoga.
Har critical admin action audit log me save hoga.

