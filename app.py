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

def get_name(indi):
    name_tag = indi.sub_tag("NAME")
    if name_tag:
        val = name_tag.value
        if isinstance(val, tuple):
            val = " ".join([str(v) for v in val if v])
        return str(val).replace("/", "").strip()
    return "Desconhecido"

def get_date(indi, tag):
    event = indi.sub_tag(tag)
    if event:
        date = event.sub_tag("DATE")
        if date:
            val = date.value
            if isinstance(val, tuple):
                val = " ".join([str(v) for v in val if v])
            return str(val)
    return ""

def get_pointer(record, tag):
    sub = record.sub_tag(tag)
    if sub:
        val = sub.value
        if isinstance(val, tuple):
            val = val[0]
        return str(val).strip()
    return None

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
    famc_val = get_pointer(indi_rec, "FAMC")
    if famc_val:
        fam_rec = families.get(famc_val)
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

def layout_tree(indi, start_y):
    if not indi:
        return
    
    indi.x = indi.generation * GEN_WIDTH + 20 * mm
    indi.y = start_y + indi.subtree_height / 2
    
    h_f = indi.father.subtree_height if indi.father else (BOX_HEIGHT + BOX_SPACING)
    
    layout_tree(indi.father, start_y)
    layout_tree(indi.mother, start_y + h_f)

def draw_tree(c, indi):
    if not indi:
        return
    
    x, y = indi.x, indi.y
    
    # Desenhar Box
    c.setStrokeColorRGB(0, 0, 0)
    c.setLineWidth(0.2 * mm)
    c.rect(x, y - BOX_HEIGHT / 2, BOX_WIDTH, BOX_HEIGHT)
    
    c.setFont("Helvetica-Bold", 10)
    c.drawString(x + 2 * mm, y + 2 * mm, indi.name)
    
    c.setFont("Helvetica", 8)
    dates = f"{indi.birth} {'- ' + indi.death if indi.death else ''}"
    c.drawString(x + 2 * mm, y - 4 * mm, dates)
    
    # Conectores
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
    
    draw_tree(c, indi.father)
    draw_tree(c, indi.mother)

def generate_pdf(root_indi):
    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=landscape(A3))
    
    tree_height = root_indi.subtree_height
    available_height = PAGE_HEIGHT - 20 * mm
    
    # Escalar a árvore se ela for maior que a altura da página
    scale = 1.0
    if tree_height > available_height:
        scale = available_height / tree_height
        
    # Centralizar verticalmente
    y_offset = (PAGE_HEIGHT - (tree_height * scale)) / 2
    
    for page_index in range(4):
        # Tiling Logic: Translate the canvas
        c.saveState()
        
        # 1. Mover para a página correta (Fatiamento)
        c.translate(-PAGE_WIDTH * page_index, 0)
        
        # 2. Centralizar verticalmente
        c.translate(0, y_offset)
        
        # 3. Aplicar escala para caber na folha A3
        c.scale(scale, scale)
        
        # Desenhar a árvore completa (o clipping do ReportLab cuidará do resto)
        draw_tree(c, root_indi)
        
        c.restoreState()
        
        # Guia de Corte (desenhada sem escala, sempre no mesmo lugar físico)
        if page_index < 3:
            c.setStrokeColorRGB(1, 0, 0)
            c.setDash(2, 2)
            c.line(PAGE_WIDTH - 0.5, 0, PAGE_WIDTH - 0.5, PAGE_HEIGHT)
            c.setDash()
            c.setFont("Helvetica", 8)
            c.setFillColorRGB(1, 0, 0)
            c.drawCentredString(PAGE_WIDTH - 5 * mm, PAGE_HEIGHT / 2, "CORTE E COLE AQUI")
            
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
                    individuals[rec.xref_id] = rec
                    
                for rec in reader.records0("FAM"):
                    families[rec.xref_id] = rec

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
                                layout_tree(root_indi, 0)
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
