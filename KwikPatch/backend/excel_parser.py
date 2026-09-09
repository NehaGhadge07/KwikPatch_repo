import openpyxl
import openpyxl.reader.drawings

import os
import re

def is_yellow_fill(cell):
    fill = cell.fill
    if not fill or fill.fill_type != 'solid':
        return False
    color = fill.fgColor
    if not color:
        return False
    
    # In openpyxl, color.rgb can be a string like 'FFFFFF00'
    if color.type == 'rgb':
        rgb = str(color.rgb).upper()
        # Common yellow color codes
        if rgb.endswith("FF00") or "FFFF00" in rgb or "FFFFC0" in rgb or "FFFF99" in rgb or "FFFF66" in rgb or "FFFF33" in rgb:
            return True
            
    return False

def parse_pi_sheet(sheet, sheet_name, filename):
    # 1. Parse Customer Name from sheet name
    # e.g., "MYERS PI 073" -> "MYERS"
    customer_name = sheet_name.strip()
    if " PI " in sheet_name.upper():
        parts = re.split(r'\s+PI\s+', sheet_name, flags=re.IGNORECASE)
        if len(parts) > 0:
            customer_name = parts[0].strip()
    elif " PI" in sheet_name.upper():
        parts = re.split(r'\s+PI', sheet_name, flags=re.IGNORECASE)
        if len(parts) > 0:
            customer_name = parts[0].strip()
            
    # Check if customer_name is generic (e.g. Sheet1, Sheet) and try to extract from filename
    if customer_name.upper() in ["SHEET1", "SHEET", "BOOK1", "PI", "PROFORMA", "UPLOAD", "INVOICE"]:
        base_filename = os.path.splitext(os.path.basename(filename))[0]
        # Remove suffix like " PI 077" or " PI" or " invoice"
        clean_filename = re.split(r'\s+PI\s*|\s*PI\s+|\s+INVOICE', base_filename, flags=re.IGNORECASE)[0].strip()
        if len(clean_filename) > 1:
            customer_name = clean_filename
            
    # 2. Extract consignee or buyer info
    # Scan the first 15 rows and columns 1-12
    consignee_lines = []
    found_consignee_marker = False
    
    for r in range(1, 16):
        for c in range(1, min(12, sheet.max_column + 1)):
            val = sheet.cell(row=r, column=c).value
            if val:
                val_str = str(val).strip()
                if val_str.upper() in ["CONSIGNEE", "TO", "CONSIGNEE:", "BUYER", "BUYER:"]:
                    found_consignee_marker = True
                    # Let's collect items from cells to the right or below
                    # We will collect the content of this cell's surroundings
                    
    # Let's gather a general block of text from the top right/consignee block (usually columns 5-10, rows 2-10)
    for r in range(2, 11):
        for c in range(4, min(12, sheet.max_column + 1)):
            val = sheet.cell(row=r, column=c).value
            if val:
                val_str = str(val).strip()
                # Skip exporters info
                if "KWIK PATCH" not in val_str.upper() and val_str not in consignee_lines:
                    if len(val_str) > 3 and not val_str.upper().startswith("PI NO") and not val_str.upper().startswith("PROFORMA"):
                        consignee_lines.append(val_str)
                        
    consignee_info = "\n".join(consignee_lines[:6]) if consignee_lines else f"Customer {customer_name}"
    
    # 3. Locate the header row
    header_row = 15 # default fallback
    qty_col_idx = None
    desc_col_idx = None
    code_col_idx = None
    
    for r in range(1, 26):
        row_vals = [sheet.cell(row=r, column=c).value for c in range(1, min(15, sheet.max_column + 1))]
        row_str = " ".join([str(v) for v in row_vals if v is not None]).upper()
        if "PRODUCT DESCRIPTION" in row_str or "PRODUCT CODE" in row_str or "QTY" in row_str or "SPECIFICATIONS" in row_str:
            header_row = r
            
            # Find specific columns
            for c_idx, val in enumerate(row_vals):
                if val:
                    val_upper = str(val).upper()
                    if "DESCRIPTION" in val_upper:
                        desc_col_idx = c_idx + 1
                    elif "CODE" in val_upper:
                        code_col_idx = c_idx + 1
                    elif "UNIT" in val_upper or "QTY" in val_upper or "TOTAL ORDER" in val_upper:
                        # Total No. of Units is preferred
                        if "TOTAL NO" in val_upper or "TOTAL UNITS" in val_upper or "NO.OF" in val_upper:
                            qty_col_idx = c_idx + 1
                        elif qty_col_idx is None:
                            qty_col_idx = c_idx + 1
            break
            
    # Set fallbacks if header detection is incomplete
    if not desc_col_idx:
        desc_col_idx = 2
    if not qty_col_idx:
        qty_col_idx = 5
    if not code_col_idx:
        code_col_idx = 2 if desc_col_idx != 2 else 1
        
    # 4. Extract yellow highlighted rows below the header
    extracted_items = []
    for r in range(header_row + 1, sheet.max_row + 1):
        is_row_yellow = False
        row_vals = []
        for c in range(1, sheet.max_column + 1):
            cell = sheet.cell(row=r, column=c)
            if is_yellow_fill(cell):
                is_row_yellow = True
            row_vals.append(cell.value)
            
        if is_row_yellow and any(v is not None for v in row_vals):
            # Extract desc
            desc_val = sheet.cell(row=r, column=desc_col_idx).value
            code_val = sheet.cell(row=r, column=code_col_idx).value if code_col_idx else None
            qty_val = sheet.cell(row=r, column=qty_col_idx).value
            
            # Clean values
            desc_str = str(desc_val).strip() if desc_val else ""
            code_str = str(code_val).strip() if code_val else ""
            
            # Skip rows that are subheaders or notes (like HSN CODE or freight comments)
            if not desc_str or "HSN CODE" in desc_str.upper() or "FREIGHT" in desc_str.upper() or "TOTAL" in desc_str.upper():
                continue
                
            # Parse quantity
            quantity = 0
            if qty_val is not None:
                try:
                    # Could be float or int (from formula evaluation)
                    quantity = int(float(qty_val))
                except (ValueError, TypeError):
                    quantity = 0
            
            if quantity > 0:
                extracted_items.append({
                    "product_code": code_str,
                    "product_desc": desc_str,
                    "quantity": quantity,
                    "row_index": r
                })
                
    return {
        "sheet_name": sheet_name,
        "customer_name": customer_name,
        "consignee_info": consignee_info,
        "items": extracted_items
    }

def parse_pi_file(filepath):
    import openpyxl.reader.drawings
    orig_find_images = openpyxl.reader.drawings.find_images
    try:
        openpyxl.reader.drawings.find_images = lambda archive, path: ([], [])
        wb = openpyxl.load_workbook(filepath, data_only=True)
    finally:
        openpyxl.reader.drawings.find_images = orig_find_images
    results = []
    filename = os.path.basename(filepath)
    for name in wb.sheetnames:
        # Ignore empty sheets or system sheets
        if name == "Final output like this" or name == "LVP + SVG":
            continue
        sheet_data = parse_pi_sheet(wb[name], name, filename)
        if sheet_data["items"]:
            results.append(sheet_data)
    return results