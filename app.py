import streamlit as st
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A3, landscape
from reportlab.lib.units import mm
from ged4py import GedcomReader
import io
import math

# Configurações de Layout
PAGE_WIDTH = 420 * mm
PAGE_HEIGHT = 297 * mm
TOTAL_WIDTH = PAGE_WIDTH * 4
BOX_WIDTH = 100 * mm
BOX_HEIGHT = 20 * mm
BOX_SPACING = 10 * mm
GEN_WIDTH = 150 * mm

class Individual:
    def __init__(self, indi_id, name, birth="", death=""):
        self.id = indi_id
        self.name = name
        self.birth = birth
        self.death = death
        self.father = None
        self.mother = None
        self.generation = 0
        self.x = 0
        self.y = 0
        self.subtree_height = 0

def clean_id(val):
    if not val: return None
    if isinstance(val, tuple): val = val[0]
    return str(val).replace("@", "").strip()

def get_sub_record(record, tag):
    if hasattr(record, 'sub_records') and record.sub_records:
        for sub in record.sub_records:
            if sub.tag == tag:
                return sub
    return None

def get_all_pointers(record, tag):
    pointers = []
    if hasattr(record, 'sub_records') and record.sub_records:
        for sub in record.sub_records:
            if sub.tag == tag:
                pid = clean_id(sub.value)
                if pid: pointers.append(pid)
    return pointers

def get_pointer(record, tag):
    sub = get_sub_record(record, tag)
    if sub:
        return clean_id(sub.value)
    return None

def get_name(indi):
    name_tag = get_sub_record(indi, "NAME")
    if name_tag:
        val = name_tag.value
        if isinstance(val, tuple):
            val = " ".join([str(v) for v in val if v])
        return str(val).replace("/", "").strip()
    return "Desconhecido"

def get_date(indi, tag):
    event = get_sub_record(indi, tag)
    if event:
        date = get_sub_record(event, "DATE")
        if date:
            val = date.value
            if isinstance(val, tuple):
                val = " ".join([str(v) for v in val if v])
            return str(val)
    return ""

def build_tree(individuals, families, indi_id, gen=0, max_gen=10):
    if gen >= max_gen:
        return None
    
    indi_rec = individuals.get(indi_id)
    if not indi_rec:
        return None
    
    name = get_name(indi_rec)
    birth = get_date(indi_rec, "BIRT")
    death = get_date(indi_rec, "DEAT")
    
    indi = Individual(indi_id, name, birth, death)
    indi.generation = gen
    
    # Buscar pais
    fam_rec = None
    famc_val = get_pointer(indi_rec, "FAMC")
    if famc_val:
        fam_rec = families.get(famc_val)
        
    if not fam_rec:
        for f_rec in families.values():
            chil_ids = get_all_pointers(f_rec, "CHIL")
            if indi_id in chil_ids:
                fam_rec = f_rec
                break
                
    if fam_rec:
        husb_val = get_pointer(fam_rec, "HUSB")
        wife_val = get_pointer(fam_rec, "WIFE")
        if husb_val:
            indi.father = build_tree(individuals, families, husb_val, gen + 1, max_gen)
        if wife_val:
            indi.mother = build_tree(individuals, families, wife_val, gen + 1, max_gen)
                
    # Calcular altura da subárvore para evitar colisões
    h_f = indi.father.subtree_height if indi.father else (BOX_HEIGHT + BOX_SPACING)
    h_m = indi.mother.subtree_height if indi.mother else (BOX_HEIGHT + BOX_SPACING)
    indi.subtree_height = max(BOX_HEIGHT + BOX_SPACING, h_f + h_m)
    
    return indi

def get_max_gen(indi):
    if not indi: return 0
    m = indi.generation
    if indi.father: m = max(m, get_max_gen(indi.father))
    if indi.mother: m = max(m, get_max_gen(indi.mother))
    return m

def layout_tree(indi, start_y, gen_w):
    if not indi:
        return
    
    indi.x = indi.generation * gen_w + 20 * mm
    indi.y = start_y + indi.subtree_height / 2
    
    h_f = indi.father.subtree_height if indi.father else (BOX_HEIGHT + BOX_SPACING)
    
    layout_tree(indi.father, start_y, gen_w)
    layout_tree(indi.mother, start_y + h_f, gen_w)

def draw_tree(c, indi):
    if not indi:
        return
    
    x, y = indi.x, indi.y
    
    # Conectores (desenhados primeiro para ficarem atrás das caixas)
    c.setStrokeColorRGB(148/255.0, 163/255.0, 184/255.0) # Slate 400
    c.setLineWidth(1.5)
    
    def draw_conn(parent):
        if not parent: return
        sx = x + BOX_WIDTH
        sy = y
        ex = parent.x
        ey = parent.y
        mx = sx + (ex - sx) / 2
        
        c.line(sx, sy, mx, sy)
        c.line(mx, sy, mx, ey)
        c.line(mx, ey, ex, ey)
        
    draw_conn(indi.father)
    draw_conn(indi.mother)
    
    # Desenhar Sombra da Caixa
    box_y = y - BOX_HEIGHT / 2
    c.setFillColorRGB(241/255.0, 245/255.0, 249/255.0) # Slate 100
    c.setStrokeColorRGB(241/255.0, 245/255.0, 249/255.0)
    c.roundRect(x + 1.5 * mm, box_y - 1.5 * mm, BOX_WIDTH, BOX_HEIGHT, 3 * mm, stroke=0, fill=1)
    
    # Desenhar Caixa Principal
    c.setFillColorRGB(1, 1, 1) # Branco
    c.setStrokeColorRGB(203/255.0, 213/255.0, 225/255.0) # Slate 200
    c.setLineWidth(1)
    c.roundRect(x, box_y, BOX_WIDTH, BOX_HEIGHT, 3 * mm, stroke=1, fill=1)
    
    # Textos - Nome
    c.setFillColorRGB(30/255.0, 41/255.0, 59/255.0) # Slate 800
    c.setFont("Helvetica-Bold", 10)
    name_str = indi.name[:35] + "..." if len(indi.name) > 35 else indi.name
    c.drawString(x + 4 * mm, box_y + 12.5 * mm, name_str)
    
    # Textos - Datas
    c.setFillColorRGB(100/255.0, 116/255.0, 139/255.0) # Slate 500
    c.setFont("Helvetica", 8)
    
    b_str = f"★ {indi.birth}" if indi.birth else ""
    d_str = f" ✝ {indi.death}" if indi.death else ""
    date_str = f"{b_str}   {d_str}".strip()
    if not date_str:
        date_str = "Datas desconhecidas"
        
    date_str = date_str[:45] + "..." if len(date_str) > 45 else date_str
    c.drawString(x + 4 * mm, box_y + 5 * mm, date_str)
    
    draw_tree(c, indi.father)
    draw_tree(c, indi.mother)

def generate_pdf(root_indi):
    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=landscape(A3))
    
    # Escala fixa 1.0 para garantir que a fonte (10pt/8pt) seja legível
    scale = 1.0
    
    # Calcular dimensões reais da árvore
    max_g = get_max_gen(root_indi)
    tree_width = (max_g * GEN_WIDTH) + BOX_WIDTH + 60 * mm
    tree_height = root_indi.subtree_height
    
    # Garantir que o layout está atualizado com a escala 1.0
    layout_tree(root_indi, 0, GEN_WIDTH)
    
    # Determinar quantas páginas A3 (420x297mm) são necessárias
    cols = math.ceil(tree_width / PAGE_WIDTH)
    rows = math.ceil(tree_height / PAGE_HEIGHT)
    
    # Limite de segurança para evitar PDFs gigantescos
    cols = min(cols, 12)
    rows = min(rows, 12)
    
    for r in range(rows):
        # r=0 é a linha de cima (topo da árvore)
        # r=rows-1 é a linha de baixo (base da árvore)
        for col in range(cols):
            c.saveState()
            
            # Tiling Logic:
            # tx desloca horizontalmente para a "coluna"
            # ty desloca verticalmente para a "linha"
            # Como o PDF (0,0) é o canto inferior esquerdo:
            # A linha r=0 deve mostrar o topo da árvore (y próximo a tree_height)
            # A linha r=rows-1 deve mostrar a base da árvore (y próximo a 0)
            
            tx = -col * PAGE_WIDTH
            ty = -(rows - 1 - r) * PAGE_HEIGHT
            
            c.translate(tx, ty)
            
            # Desenhar a árvore na escala original
            draw_tree(c, root_indi)
            
            c.restoreState()
            
            # Guias de Corte e Identificação
            c.setStrokeColorRGB(1, 0, 0) # Vermelho para guias
            c.setLineWidth(0.1 * mm)
            c.setDash(2, 2)
            
            # Borda Direita (se houver próxima coluna)
            if col < cols - 1:
                c.line(PAGE_WIDTH - 0.5, 0, PAGE_WIDTH - 0.5, PAGE_HEIGHT)
            
            # Borda Inferior (se houver próxima linha)
            if r < rows - 1:
                c.line(0, 0.5, PAGE_WIDTH, 0.5)
                
            c.setDash()
            c.setFont("Helvetica", 7)
            c.setFillColorRGB(1, 0, 0)
            
            # Texto de ajuda nas bordas
            info_text = f"Página {r * cols + col + 1} (Linha {r+1}, Col {col+1})"
            c.drawString(5 * mm, 5 * mm, info_text)
            
            if col < cols - 1:
                c.drawCentredString(PAGE_WIDTH - 10 * mm, PAGE_HEIGHT / 2, "CORTE E COLE ->")
            if r < rows - 1:
                c.drawCentredString(PAGE_WIDTH / 2, 10 * mm, "V CORTE E COLE V")
            
            c.showPage()
            
    c.save()
    buffer.seek(0)
    return buffer

# Streamlit UI
st.set_page_config(page_title="GEDCOM to PDF Tree", layout="centered")

st.title("🌳 GEDCOM to PDF Banner")
st.write("Converta seu arquivo .ged em um banner de 4 páginas A3.")

uploaded_file = st.file_uploader("Escolha um arquivo GEDCOM", type="ged")

if uploaded_file:
    with st.spinner("Processando árvore..."):
        # Salvar temporariamente para o ged4py
        with open("temp.ged", "wb") as f:
            f.write(uploaded_file.getbuffer())
            
        try:
            # Tentar diferentes encodings comuns em arquivos GEDCOM
            encodings = ['utf-8', 'latin-1', 'utf-16', 'ascii']
            reader = None
            for enc in encodings:
                try:
                    reader = GedcomReader("temp.ged", encoding=enc)
                    # Testar se consegue ler o primeiro registro
                    next(reader.records0("INDI"))
                    break
                except:
                    if reader: reader.close()
                    reader = None
                    continue
            
            if not reader:
                # Se falhou com encoding específico, tenta o padrão do ged4py
                reader = GedcomReader("temp.ged")

            with reader:
                individuals = {}
                families = {}
                
                for rec in reader.records0("INDI"):
                    idx = clean_id(rec.xref_id)
                    if idx: individuals[idx] = rec
                    
                for rec in reader.records0("FAM"):
                    idx = clean_id(rec.xref_id)
                    if idx: families[idx] = rec

                if not individuals:
                    st.error("Nenhum indivíduo (INDI) encontrado no arquivo GEDCOM.")
                    st.stop()

                # Criar opções para o selectbox
                indi_options = []
                for i_id, rec in individuals.items():
                    name = get_name(rec)
                    birth = get_date(rec, "BIRT")
                    label = f"{name} ({birth})" if birth else name
                    indi_options.append((i_id, label))
                
                indi_options.sort(key=lambda x: x[1])
                
                st.write("---")
                st.subheader("Configuração da Árvore")
                
                root_id = st.selectbox(
                    "Selecione a pessoa principal (Raiz da Árvore):",
                    options=[x[0] for x in indi_options],
                    format_func=lambda x: next(item[1] for item in indi_options if item[0] == x)
                )
                
                if root_id:
                    if st.button("Gerar Árvore", type="primary"):
                        with st.spinner("Gerando PDF..."):
                            root_indi = build_tree(individuals, families, root_id)
                            
                            if root_indi:
                                pdf_buffer = generate_pdf(root_indi)
                                
                                st.success(f"Árvore pronta para: {root_indi.name}")
                                st.download_button(
                                    label="📥 Baixar PDF (4x A3)",
                                    data=pdf_buffer,
                                    file_name="arvore_genealogica.pdf",
                                    mime="application/pdf"
                                )
                            else:
                                st.error("Erro ao construir a árvore para esta pessoa.")
        except Exception as e:
            st.error(f"Erro ao processar: {e}")
