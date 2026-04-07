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
        return name_tag.value.replace("/", "").strip()
    return "Desconhecido"

def get_date(indi, tag):
    event = indi.sub_tag(tag)
    if event:
        date = event.sub_tag("DATE")
        if date:
            return date.value
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
    famc = indi_rec.sub_tag("FAMC")
    if famc:
        fam_rec = families.get(famc.value)
        if fam_rec:
            husb = fam_rec.sub_tag("HUSB")
            wife = fam_rec.sub_tag("WIFE")
            if husb:
                indi.father = build_tree(individuals, families, husb.value, gen + 1, max_gen)
            if wife:
                indi.mother = build_tree(individuals, families, wife.value, gen + 1, max_gen)
                
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
    
    for page_index in range(4):
        # Tiling Logic: Translate the canvas
        c.saveState()
        c.translate(-PAGE_WIDTH * page_index, 0)
        
        # Desenhar a árvore completa (o clipping do ReportLab cuidará do resto)
        draw_tree(c, root_indi)
        
        c.restoreState()
        
        # Guia de Corte
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

                # Pegar o primeiro indivíduo disponível
                root_id = list(individuals.keys())[0]
                root_indi = build_tree(individuals, families, root_id)
                
                if root_indi:
                    layout_tree(root_indi, 20 * mm)
                    pdf_buffer = generate_pdf(root_indi)
                    
                    st.success(f"Árvore processada: {root_indi.name}")
                    st.download_button(
                        label="📥 Baixar PDF (4x A3)",
                        data=pdf_buffer,
                        file_name="arvore_genealogica.pdf",
                        mime="application/pdf"
                    )
                else:
                    st.error("Não foi possível encontrar a raiz da árvore.")
        except Exception as e:
            st.error(f"Erro ao processar: {e}")
