import 'dotenv/config';
import prisma from '../src/lib/prisma';
import { normalizeBlogSlug, sanitizeBlogHtml } from '../src/utils/blogContent';

type SeedArticle = {
  title: string;
  excerpt: string;
  contentHtml: string;
};

const articles: SeedArticle[] = [
  {
    title: 'How to Inspect a Used JCB Excavator Before You Buy',
    excerpt: 'A practical inspection guide for checking a used excavator\'s hydraulics, undercarriage, engine, attachments, and service history before making an offer.',
    contentHtml: `<h2>Why a proper excavator inspection matters</h2>
<p>A used excavator can deliver excellent value when its operating hours, maintenance history, and working condition are verified properly. The most expensive surprises usually come from hydraulic wear, undercarriage damage, neglected cooling systems, or incomplete ownership records. Inspect the machine in daylight and, whenever possible, test it from a cold start.</p>
<h2>Start with the machine history</h2>
<p>Ask for service invoices, previous repair records, ownership documents, and details of the jobs where the excavator was used. A machine used mainly for light earthwork may show a very different wear pattern from one used continuously in rock, demolition, or quarry work. Compare the hour meter with the service records and look for signs that the meter or dashboard has been replaced.</p>
<h2>Check the engine and cooling system</h2>
<p>Inspect the engine bay for oil leaks, coolant stains, loose wiring, damaged hoses, and non-factory repairs. Start the engine when it is cold and observe how quickly it reaches a stable idle. Excessive smoke, hard starting, unusual knocking, or heavy blow-by from the breather can indicate internal wear. Check the radiator and cooling pack for blocked fins because poor airflow can create overheating problems during long shifts.</p>
<h2>Test hydraulics, boom, arm, and bucket</h2>
<p>Operate every movement slowly and then under a practical load. The boom, arm, and bucket should move smoothly without jerking, excessive noise, or visible hydraulic leakage. Hold the attachment in position for a short time and watch for drift. Inspect hydraulic cylinders for scored rods and wet seals, and check hoses for bulging, cracking, or fresh oil marks.</p>
<h2>Inspect the undercarriage and attachments</h2>
<p>Undercarriage repairs can significantly change the purchase cost. Check track shoe condition, rollers, idlers, sprockets, track tension, and side-frame damage. Look at the bucket pins and bushes for excessive play and confirm that the supplied attachments match the work you plan to do. A machine with a healthy upper structure can still need major investment if the undercarriage is near the end of its life.</p>
<h2>Make the decision with total cost in mind</h2>
<p>Do not compare machines on price alone. Add the cost of immediate repairs, tyres or tracks, transportation, insurance, taxes, and any missing attachment. Take a written inspection report and verify the serial number before paying. If a seller avoids a cold start or refuses an independent inspection, treat that as a serious warning sign.</p>`,
  },
  {
    title: 'JCB 3DX Maintenance Schedule: Daily, Weekly, and Monthly Checks',
    excerpt: 'Keep a JCB 3DX backhoe loader productive with a simple maintenance routine covering fluids, filters, tyres, hydraulics, pins, and daily operator checks.',
    contentHtml: `<h2>Why preventive maintenance saves operating cost</h2>
<p>A JCB 3DX works across digging, loading, trenching, roadwork, and material handling jobs. The same versatility also means that small maintenance issues can become expensive downtime if they are ignored. A consistent operator checklist helps identify leaks, loose pins, overheating, and tyre wear before they affect a full working day.</p>
<h2>Daily checks before starting work</h2>
<ul>
  <li>Walk around the machine and check for fresh oil, coolant, fuel, or hydraulic leaks.</li>
  <li>Check engine oil, coolant, hydraulic oil, and fuel levels according to the operator manual.</li>
  <li>Inspect tyres, wheel nuts, stabilisers, bucket teeth, pins, and visible hose damage.</li>
  <li>Clean the radiator and cooling pack when dust or crop residue restricts airflow.</li>
  <li>Test warning lights, horn, brakes, steering, lights, and safety controls.</li>
</ul>
<h2>Weekly maintenance routine</h2>
<p>Clean the machine before inspecting it so that cracks and leaks are visible. Grease the recommended pivot points, inspect loader and excavator pin movement, and check the condition of the air intake. Examine battery terminals and electrical connections for corrosion. Confirm that the stabiliser legs, boom lock, and hydraulic controls operate smoothly without abnormal noise.</p>
<h2>Monthly checks and service planning</h2>
<p>Review the service-hour schedule instead of waiting for a problem. Replace filters and fluids only with products and intervals approved for your specific model and working conditions. Inspect belts, hoses, fan guards, exhaust mounting, axle oil, transmission oil, and differential areas. Record the hour meter, parts used, and observations in a maintenance log that stays with the machine.</p>
<h2>Common warning signs to act on early</h2>
<p>Slow hydraulic movement, rising engine temperature, uneven braking, repeated battery discharge, milky oil, unusual smoke, and new vibration all deserve attention. Stop operation when a safety-critical problem appears. Continuing to work through a small leak or overheating issue can damage pumps, seals, or the engine and may create a much longer repair delay.</p>
<h2>Build a maintenance habit for every operator</h2>
<p>The best checklist is the one operators actually complete. Keep the inspection sheet in the cabin, assign responsibility for reporting defects, and close every reported issue with a date and repair note. Maintenance intervals vary by model, attachment, environment, and working hours, so always use the official JCB handbook for exact capacities and service specifications.</p>`,
  },
  {
    title: 'Wheel Loader Buying Guide: What to Check for Construction and Quarry Work',
    excerpt: 'Compare a used wheel loader with confidence by evaluating bucket capacity, tyres, articulation, hydraulics, drivetrain, visibility, and job-site suitability.',
    contentHtml: `<h2>Choose the loader around the job, not only the price</h2>
<p>Wheel loaders are productive when the machine, bucket, and work cycle match the site. A loader used for stockpiling, truck loading, road construction, or quarry work faces different demands. Before viewing a machine, estimate the material type, average payload, loading height, travel distance, and number of operating hours per shift.</p>
<h2>Inspect the bucket and loading linkage</h2>
<p>Check the bucket cutting edge, teeth, side cutters, welds, and floor for excessive wear. Operate the lift arms through their full range and listen for pump noise or cylinder leakage. Excessive play around pins and bushes can reduce loading accuracy and indicate that the linkage needs rebuilding. Confirm that the bucket size is suitable for the material density and the machine rating.</p>
<h2>Check tyres and articulation joint</h2>
<p>Tyres are a major operating expense on a wheel loader. Look for uneven wear, sidewall damage, exposed cords, deep cuts, and mismatched sizes. Inspect the articulation joint, centre pins, steering cylinders, and hoses for looseness or leakage. During a drive test, the loader should steer predictably without excessive movement or unusual clunking from the joint.</p>
<h2>Test the engine, transmission, and brakes</h2>
<p>Start the machine cold and check idle stability, exhaust smoke, and response under load. Test forward and reverse travel at different speeds and verify that gear changes are smooth. Check service brakes, parking brake, and emergency functions on a safe, level area. A loader that loses power on a slope or hesitates while reversing may need deeper drivetrain or transmission diagnosis.</p>
<h2>Review operator comfort and site safety</h2>
<p>Visibility, mirrors, cameras, steps, handrails, seat condition, and cabin controls directly affect productivity and safety. Check that the dashboard shows normal readings and that warning lights work as intended. Inspect the ROPS/FOPS structure and confirm that doors, windows, wipers, lights, and the horn are functional before purchase.</p>
<h2>Calculate the complete ownership cost</h2>
<p>Include tyres, bucket repairs, filters, fluids, transport, insurance, taxes, and expected fuel use in the comparison. Verify the serial number, ownership documents, finance status, and service history. A well-maintained loader with transparent records can be a better investment than a cheaper machine with unknown hours or deferred repairs.</p>`,
  },
  {
    title: 'Backhoe Loader vs Excavator: Which Machine Fits Your Project?',
    excerpt: 'Understand the practical differences between a JCB backhoe loader and an excavator for roadwork, utilities, construction, farms, and material handling.',
    contentHtml: `<h2>Start with the work you need to finish</h2>
<p>Backhoe loaders and excavators can both dig, but they are designed around different work patterns. A backhoe loader combines a front loader with a rear excavator arm, making it useful for mixed jobs and road travel. An excavator is built around digging performance, swing power, reach, and attachment flexibility. The right choice depends on the full work cycle rather than one impressive specification.</p>
<h2>When a backhoe loader is the better choice</h2>
<p>A backhoe loader is a strong fit for utility trenching, small foundations, road maintenance, farm work, drainage, loading, and sites where the machine must move between locations. Its front bucket handles soil and aggregate while the rear attachment digs. Models such as the JCB 3DX are popular with contractors who need one versatile machine for several daily tasks.</p>
<h2>When an excavator makes more sense</h2>
<p>An excavator is usually better for longer digging cycles, deeper excavation, heavy earthwork, demolition, quarry work, and projects that use specialised attachments. Its tracked undercarriage provides stability on many job sites, while the upper structure and hydraulic system are designed for continuous digging and lifting work. Excavators also offer a wider choice of buckets, breakers, augers, and other tools.</p>
<h2>Compare productivity and mobility</h2>
<p>Consider travel time, transport requirements, ground conditions, digging depth, reach, lifting needs, and available operators. A backhoe loader can travel on roads more easily in many situations, while an excavator may deliver better cycle time and stability for concentrated digging. If the machine spends most of the day loading, trenching, or moving around a large project, the productivity difference can quickly outweigh the initial price difference.</p>
<h2>Compare ownership and maintenance needs</h2>
<p>Both machines require disciplined checks for fluids, filters, pins, bushes, tyres or tracks, hydraulics, and safety controls. Compare the availability and cost of local parts and service support. When buying used, verify the condition of the attachment, undercarriage or tyres, hydraulic cylinders, and hour meter before comparing two machines only by model year.</p>
<h2>Use a simple decision checklist</h2>
<ol>
  <li>List the three tasks that will take most of the machine's working hours.</li>
  <li>Measure the required digging depth, reach, lifting height, and payload.</li>
  <li>Confirm whether road travel or site mobility is important.</li>
  <li>Price the attachments and routine maintenance required for the job.</li>
  <li>Choose the machine with the best total cost and service support, not just the lowest purchase price.</li>
</ol>`,
  },
  {
    title: 'JCB Road Roller and Motor Grader Guide for Better Road Construction Results',
    excerpt: 'Learn how compactors and motor graders support road construction, from subgrade preparation and drainage to compaction passes and final surface quality.',
    contentHtml: `<h2>Road quality starts before the final pass</h2>
<p>A smooth road surface depends on preparation, material moisture, grading accuracy, and consistent compaction. Compactor or road roller and motor grader operators need to work as one process. If the subgrade is weak or the material is too wet, extra rolling alone will not produce a durable result.</p>
<h2>Where the motor grader adds value</h2>
<p>A motor grader shapes the subgrade, maintains the required camber, trims shoulders, and distributes material before compaction. Check the cutting edge, circle drive, moldboard movement, articulation, tyres, steering, and hydraulic cylinders before buying a used grader. Blade response should be smooth and precise because small level errors can create drainage and ride-quality problems across a long stretch.</p>
<h2>How a road roller supports the work</h2>
<p>A road roller compacts soil, aggregate, or asphalt through controlled passes. The correct machine and drum configuration depend on the material and layer thickness. Inspect the drum surface, vibration system, water spray system, scrapers, tyres, and operator controls. Uneven vibration, blocked spray nozzles, or damaged scrapers can reduce compaction quality and increase rework.</p>
<h2>Plan passes around material and moisture</h2>
<p>Use a test section to decide the practical number of passes, travel speed, and moisture condition. Keep roller speed consistent and avoid abrupt direction changes on fresh asphalt. For soil and aggregate, coordinate grading and rolling so that the material is compacted while it remains within the workable moisture range. Record the process so operators can repeat what works on later sections.</p>
<h2>Used machine inspection checklist</h2>
<ul>
  <li>Check engine starting, cooling, smoke, oil condition, and service records.</li>
  <li>Test transmission, brakes, steering, tyres, and emergency controls.</li>
  <li>Inspect hydraulic hoses, cylinders, blade linkages, drum mounts, and vibration controls.</li>
  <li>Verify water spray, lights, mirrors, seat, access steps, and visibility.</li>
  <li>Confirm serial numbers, ownership papers, and any previous project repair history.</li>
</ul>
<h2>Match equipment to the road programme</h2>
<p>Buy or hire equipment based on the size of the project, material type, expected production rate, and local service support. A machine that is easy to maintain and correctly matched to the work will usually deliver better results than a larger machine that spends most of its time waiting or operating outside its ideal application.</p>`,
  },
];

const faqSectionsBySlug: Record<string, string> = {
  [normalizeBlogSlug('How to Inspect a Used JCB Excavator Before You Buy')]: `<h2>Frequently Asked Questions</h2>
<h3>What should I check first when viewing a used excavator?</h3>
<p>Start with the machine history, serial number, hour meter, cold-start behaviour, and visible leaks. Then test the hydraulics and inspect the undercarriage before discussing the final price.</p>
<h3>How can I identify excavator hydraulic wear?</h3>
<p>Look for scored cylinder rods, wet seals, damaged hoses, slow or jerky movements, abnormal pump noise, and hydraulic drift while an attachment is held in position. A qualified technician should confirm the cause before purchase.</p>
<h3>Is a high-hour excavator always a bad investment?</h3>
<p>No. Working hours should be assessed together with service records, operating conditions, component replacements, and current test results. A well-maintained high-hour machine can be safer to buy than a low-hour machine with incomplete records.</p>`,
  [normalizeBlogSlug('JCB 3DX Maintenance Schedule: Daily, Weekly, and Monthly Checks')]: `<h2>Frequently Asked Questions</h2>
<h3>How often should a JCB 3DX be inspected?</h3>
<p>Perform a walk-around and basic fluid, tyre, leak, and safety check before every shift. Weekly and monthly checks should follow the machine's operating-hour schedule and the official JCB handbook.</p>
<h3>Which maintenance records should an owner keep?</h3>
<p>Record the date, hour meter, fluids and filters used, grease points serviced, defects found, parts replaced, and the person who completed the work. Clear records make troubleshooting easier and support the machine's resale value.</p>
<h3>Can I continue working when a hydraulic leak is small?</h3>
<p>Do not ignore a hydraulic leak. Stop safely, identify the source, and repair it according to the service procedure. Hydraulic oil can create a safety hazard and a small leak can quickly damage pumps, seals, or other components.</p>`,
  [normalizeBlogSlug('Wheel Loader Buying Guide: What to Check for Construction and Quarry Work')]: `<h2>Frequently Asked Questions</h2>
<h3>What is the most expensive area to inspect on a used wheel loader?</h3>
<p>Tyres, articulation components, hydraulics, drivetrain, and the loading linkage can all create significant costs. Inspect these areas under working conditions and include likely repairs in the total ownership calculation.</p>
<h3>How do I choose the right bucket size?</h3>
<p>Match bucket capacity to the machine's rated operating load, material density, loading height, and cycle pattern. A larger bucket is not automatically more productive if it causes overload, slow cycles, or premature wear.</p>
<h3>What documents should I verify before buying?</h3>
<p>Verify the serial number, ownership documents, finance status, service history, previous repair records, and any applicable transport or tax paperwork. The details should match the machine being inspected.</p>`,
  [normalizeBlogSlug('Backhoe Loader vs Excavator: Which Machine Fits Your Project?')]: `<h2>Frequently Asked Questions</h2>
<h3>Is a backhoe loader better than an excavator for roadwork?</h3>
<p>It depends on the work mix. A backhoe loader is convenient for road maintenance, utilities, loading, and travel between locations, while an excavator is usually stronger for long digging cycles, deep excavation, and heavy attachments.</p>
<h3>Which machine is easier to move between job sites?</h3>
<p>A backhoe loader can often travel between nearby sites more easily, subject to local rules and site conditions. A tracked excavator may need a trailer, especially when moving over public roads or longer distances.</p>
<h3>What should I compare besides purchase price?</h3>
<p>Compare productivity, fuel use, attachments, transport, operator availability, service support, parts cost, tyres or tracks, and expected downtime. The best machine is the one that delivers the lowest practical cost for the full project.</p>`,
  [normalizeBlogSlug('JCB Road Roller and Motor Grader Guide for Better Road Construction Results')]: `<h2>Frequently Asked Questions</h2>
<h3>How many roller passes are needed for good compaction?</h3>
<p>There is no single number for every project. Use a test section to establish the pass count, travel speed, layer thickness, and moisture condition for the specific material and machine combination.</p>
<h3>What should I check on a used road roller?</h3>
<p>Inspect the drum, vibration system, water spray system, scrapers, engine, transmission, brakes, steering, tyres, controls, and service records. Confirm that vibration is even and that the spray nozzles work correctly.</p>
<h3>Why must grading and compaction be planned together?</h3>
<p>The motor grader creates the correct shape, camber, and drainage profile, while the roller achieves the required density. Coordinating both operations prevents rework and helps the material stay within its workable moisture range.</p>`,
};

const existingInspectionFaq = `<h2>Frequently Asked Questions</h2>
<h3>What is the most important check before buying a used JCB machine?</h3>
<p>Begin with a cold start, service history, serial number, and a complete inspection of the engine, hydraulics, transmission, tyres or undercarriage, attachments, and safety systems. A practical test under load is more reliable than appearance alone.</p>
<h3>Should I hire an independent technician?</h3>
<p>Yes, an independent inspection is especially valuable when the machine has high hours, incomplete records, visible repairs, or expensive attachments. The inspection report can help you understand immediate repair costs before making an offer.</p>
<h3>How do I compare two used machines fairly?</h3>
<p>Compare verified hours, maintenance quality, component condition, attachments, application history, ownership documents, transport cost, and expected repairs. Use total ownership cost rather than the advertised price as the final comparison.</p>`;

const existingInspectionArticle: SeedArticle = {
  title: 'Used JCB Machine Buying Guide: Complete Inspection Checklist',
  excerpt: 'A practical checklist for inspecting the engine, hydraulics, transmission, tyres, documents, service history, and overall condition of a used JCB machine before purchase.',
  contentHtml: `<h2>Why a complete inspection matters</h2>
<p>Buying a used JCB machine is an important investment. A machine that looks clean can still have hidden hydraulic, engine, transmission, or structural problems. Inspect the machine in daylight, request a cold start, and test it under practical working conditions before making a final decision.</p>
<h2>Check the overall condition of the machine</h2>
<p>Walk around the machine and look for cracks, abnormal welding, corrosion, fresh paint, oil marks, damaged guards, and loose panels. Fresh paint is not automatically a problem, but it should be checked against the service history and previous repair records.</p>
<h2>Inspect the engine and cooling system</h2>
<p>Start the engine when it is cold and listen for unusual knocking, hard starting, unstable idle, or excessive smoke. Check oil and coolant condition, radiator cleanliness, belts, hoses, wiring, and signs of blow-by. An overheating machine can create expensive downtime even when it starts normally.</p>
<h2>Test hydraulics, transmission, and controls</h2>
<p>Operate every boom, arm, bucket, loader, steering, and attachment function slowly and under load. Look for jerky movement, pump noise, cylinder drift, scored rods, leaking seals, and damaged hoses. Test forward and reverse travel, brakes, steering, parking brake, lights, horn, and safety controls in a safe area.</p>
<h2>Check tyres, undercarriage, attachments, and documents</h2>
<p>Inspect tyre tread and sidewalls or, on tracked machines, shoes, rollers, idlers, sprockets, and track tension. Check attachment pins, bushes, cutting edges, teeth, and welds for excessive wear. Finally, verify the serial number, ownership papers, finance status, service records, hour meter, and transport requirements.</p>
<h2>Make the purchase decision using total cost</h2>
<p>List immediate repairs, missing attachments, transportation, taxes, insurance, and routine service costs before comparing machines. If the seller refuses a cold start, working test, serial-number check, or independent inspection, treat that as a serious warning sign.</p>${existingInspectionFaq}`,
};

const seedBlogPosts = async () => {
  const publishedAt = new Date();

  for (const article of articles) {
    const slug = normalizeBlogSlug(article.title);
    const contentHtml = sanitizeBlogHtml(`${article.contentHtml}${faqSectionsBySlug[slug] || ''}`);

    await prisma.blogPost.upsert({
      where: { slug },
      update: {
        title: article.title,
        excerpt: article.excerpt,
        contentHtml,
        isPublished: true,
        publishedAt,
      },
      create: {
        title: article.title,
        slug,
        excerpt: article.excerpt,
        contentHtml,
        coverImageUrl: null,
        isPublished: true,
        publishedAt,
        createdById: null,
      },
    });

    console.log(`Seeded: ${article.title} -> /blog/${slug}`);
  }

  const existingInspectionSlug = normalizeBlogSlug('Used JCB Machine Buying Guide: Complete Inspection Checklist');
  const existingInspection = await prisma.blogPost.findUnique({ where: { slug: existingInspectionSlug } });
  if (existingInspection && !/<h2\b[^>]*>\s*(?:frequently\s+asked\s+questions|faq|faqs)\s*<\/h2>/i.test(existingInspection.contentHtml)) {
    await prisma.blogPost.update({
      where: { id: existingInspection.id },
      data: { contentHtml: sanitizeBlogHtml(`${existingInspection.contentHtml}${existingInspectionFaq}`) },
    });
    console.log(`Added FAQ section: ${existingInspection.title}`);
  } else if (!existingInspection) {
    await prisma.blogPost.create({
      data: {
        title: existingInspectionArticle.title,
        slug: existingInspectionSlug,
        excerpt: existingInspectionArticle.excerpt,
        contentHtml: sanitizeBlogHtml(existingInspectionArticle.contentHtml),
        coverImageUrl: null,
        isPublished: true,
        publishedAt,
        createdById: null,
      },
    });
    console.log(`Restored missing article: ${existingInspectionArticle.title}`);
  }

  const count = await prisma.blogPost.count({ where: { isPublished: true } });
  console.log(`Published blog posts available: ${count}`);
};

seedBlogPosts()
  .catch((error) => {
    console.error('Blog seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
