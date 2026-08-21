const fs = require('fs');

function fixSuperadminListings() {
    const path = "admin-portal/src/app/(admin)/superadmin/listings/page.tsx";
    let content = fs.readFileSync(path, 'utf8');

    // The block where fields should be
    // We can just find the Brand Field and insert after it.
    const regex = /(<Field label="Brand">[\s\S]*?<\/Field>)\s*<\/Field>\s*<Field label="Meter Reading">/g;
    const correctFields = `
                    <Field label="Model">
                      <input value={form.model} onChange={(event) => updateField('model', event.target.value)} className={fieldClassName} />
                    </Field>
                    <Field label="Variant">
                      <input value={form.variant} onChange={(event) => updateField('variant', event.target.value)} className={fieldClassName} />
                    </Field>
                    <Field label="Gross Power">
                      <input value={form.grossPower} onChange={(event) => updateField('grossPower', event.target.value)} className={fieldClassName} placeholder="e.g. 76 hp (56 kW)" />
                    </Field>
                    <Field label="Manufacture Year">
                      <input type="number" value={form.manufacturingYear} onChange={(event) => updateField('manufacturingYear', event.target.value)} className={fieldClassName} />
                    </Field>
                    <Field label="Registration Year">
                      <input type="number" value={form.registrationYear} onChange={(event) => updateField('registrationYear', event.target.value)} className={fieldClassName} />
                    </Field>
                    <Field label="Registration No.">
                      <input value={form.registrationNo} onChange={(event) => updateField('registrationNo', event.target.value)} className={fieldClassName} />
                    </Field>
                    <Field label="Insurance Expiry Date">
                      <input type="date" value={form.insuranceExpiry} onChange={(event) => updateField('insuranceExpiry', event.target.value)} className={fieldClassName} />
                    </Field>
                    <Field label="Chassis / Serial No.">
                      <input value={form.chassisOrSerialNo} onChange={(event) => updateField('chassisOrSerialNo', event.target.value)} className={fieldClassName} />
                    </Field>
`;
    
    if (!regex.test(content)) {
        console.log("Could not find broken block in superadmin listings");
    } else {
        content = content.replace(regex, `$1\n${correctFields}                    <Field label="Meter Reading">`);
        fs.writeFileSync(path, content, 'utf8');
        console.log("Fixed superadmin listings page.");
    }
}

function fixPartnerListings() {
    const path = "admin-portal/src/app/(partner)/partner/listings/page.tsx";
    let content = fs.readFileSync(path, 'utf8');

    const regex = /(<Field label="Brand">[\s\S]*?<\/Field>)\s*<\/Field>\s*<Field label="Gross Power">/g;
    const correctFields = `
                    <Field label="Model">
                      <input value={form.model} onChange={(event) => updateField('model', event.target.value)} className={fieldClassName} />
                    </Field>
                    <Field label="Variant">
                      <input value={form.variant} onChange={(event) => updateField('variant', event.target.value)} className={fieldClassName} />
                    </Field>
`;
    
    if (!regex.test(content)) {
        console.log("Could not find broken block in partner listings");
        // Let's try the other regex in case it was damaged differently
        const regex2 = /(<Field label="Brand">[\s\S]*?<\/Field>)\s*<p className="mt-1 text-xs text-gray-500">/g;
        if (regex2.test(content)) {
            console.log("Found weird block in partner listings");
        }
    } else {
        content = content.replace(regex, `$1\n${correctFields}                    <Field label="Gross Power">`);
        fs.writeFileSync(path, content, 'utf8');
        console.log("Fixed partner listings page.");
    }
}

fixSuperadminListings();
fixPartnerListings();
