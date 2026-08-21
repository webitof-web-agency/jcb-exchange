import re

def fix_superadmin_listings():
    path = r"g:\Webitof company\jcbexchange\admin-portal\src\app\(admin)\superadmin\listings\page.tsx"
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()

    # The block where fields should be
    # Let's find the Category and Brand SearchableSelects
    match = re.search(r'(<Field label="Category">[\s\S]*?<Field label="Brand">[\s\S]*?</Field>)\s*</Field>\s*<Field label="Meter Reading">', content)
    if not match:
        print("Could not find the broken block")
        return
        
    correct_fields = """
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
"""
    
    new_content = content.replace(match.group(0), match.group(1) + correct_fields + '                    <Field label="Meter Reading">')
    
    with open(path, "w", encoding="utf-8") as f:
        f.write(new_content)
    print("Fixed superadmin listings page.")

def fix_partner_listings():
    path = r"g:\Webitof company\jcbexchange\admin-portal\src\app\(partner)\partner\listings\page.tsx"
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()

    # The block where fields should be
    # Let's find the Category and Brand SearchableSelects
    match = re.search(r'(<Field label="Category">[\s\S]*?<Field label="Brand">[\s\S]*?</Field>)\s*</Field>\s*<Field label="Insurance Expiry Date">', content)
    if not match:
        print("Could not find the broken block in partner listings")
        # Maybe it's not broken in the same way? Let's check
    else:
        correct_fields = """
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
"""
        new_content = content.replace(match.group(0), match.group(1) + correct_fields + '                    <Field label="Insurance Expiry Date">')
        with open(path, "w", encoding="utf-8") as f:
            f.write(new_content)
        print("Fixed partner listings page.")

fix_superadmin_listings()
fix_partner_listings()
