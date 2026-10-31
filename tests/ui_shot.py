#!/usr/bin/env python3
"""Render design mockups of the HUD/menu via ImageMagick so the CSS look can be reviewed headlessly."""
import subprocess, os, textwrap

W, H = 1280, 720
OUT = 'shots'
os.makedirs(OUT, exist_ok=True)
F = 'DejaVu-Sans-Bold'
FR = 'DejaVu-Sans'

def run(args):
    subprocess.run(args, check=True)

def esc(t):
    return t.replace('"', '\\"')

# ---------- background: city screenshot + dark overlay ----------
def make_bg(dst, src, blur=0, tint='#04121a', alpha=0.55):
    args = ['convert', src, '-resize', f'{W}x{H}^', '-gravity', 'center', '-extent', f'{W}x{H}']
    if blur:
        args += ['-blur', f'0x{blur}']
    args += ['-fill', tint, '-colorize', '55']
    args += [dst]
    run(args)

# ================= HUD =================
def draw_hud(dst):
    imgs = []
    # top-left turtle cards
    cards = [('1','ЛЕО','#4d8dff',1.0,True,'ЛЕО'), ('2','РАФ','#ff5a4d',0.72,False,''),
             ('3','ДОН','#b76bff',1.0,False,''), ('4','МАЙКИ','#ffab3d',0.55,False,'')]
    cmd = ['convert', '-size', f'{W}x{H}', 'xc:none', '-fill', 'none']
    for i,(num,name,color,hp,active,_) in enumerate(cards):
        x = 22 + i*86
        y = 18
        dy = -6 if active else 0
        border = color if active else '#33ffffff'
        cmd += ['-stroke', border, '-strokewidth', '2' if not active else '3',
                '-fill', '#0a1418ee', '-draw', f'roundrectangle {x},{y+dy} {x+64},{y+dy+96} 8,8']
        # mask band + face
        cmd += ['-stroke', 'none', '-fill', '#5f9a34', '-draw', f'ellipse {x+33},{y+dy+42} 20,14 0,360']
        cmd += ['-fill', color, '-draw', f'rectangle {x+13},{y+dy+35} {x+53},{y+dy+48}']
        cmd += ['-fill', '#ffffff', '-draw', f'ellipse {x+25},{y+dy+42} 5,5 0,360']
        cmd += ['-fill', '#ffffff', '-draw', f'ellipse {x+41},{y+dy+42} 5,5 0,360']
        cmd += ['-fill', '#101010', '-draw', f'circle {x+26},{y+dy+42} {x+27},{y+dy+42}']
        cmd += ['-fill', '#101010', '-draw', f'circle {x+42},{y+dy+42} {x+43},{y+dy+42}']
        cmd += ['-fill', '#dfe9df', '-font', F, '-pointsize', '12', '-stroke', 'none',
                '-gravity', 'northwest', '-annotate', f'+{x+15}+{y+dy+58}', name]
        # hp bar
        cmd += ['-fill', '#ffffff26', '-draw', f'rectangle {x+9},{y+dy+76} {x+57},{y+dy+81}']
        if hp > 0:
            cmd += ['-fill', color, '-draw', f'rectangle {x+9},{y+dy+76} {x+9+int(48*hp)},{y+dy+81}']
        cmd += ['-fill', '#ffffff99', '-font', F, '-pointsize', '10', '-annotate', f'+{x+6}+{y+dy+14}', num]
        cmd += ['-fill', '#1de3c2', '-font', F, '-pointsize', '8', '-annotate', f'+{x+44}+{y+dy+14}', 'СПЕЦ']
    # objective panel
    cmd += ['-fill', '#081014e0', '-stroke', '#ffffff22', '-strokewidth', '1',
            '-draw', f'roundrectangle 480,16 800,106 12,12']
    cmd += ['-fill', '#ff8a1f', '-font', F, '-pointsize', '11', '-annotate', '+600+34', 'ГЛАВА 1']
    cmd += ['-fill', '#ffffff', '-font', F, '-pointsize', '21', '-annotate', '+525+58', 'Переулок Клинка']
    cmd += ['-fill', '#ffffff22', '-draw', 'roundrectangle 506,72 774,78 3,3']
    cmd += ['-fill', '#7ee04a', '-draw', 'roundrectangle 506,72 690,78 3,3']
    cmd += ['-fill', '#a9bdb0', '-font', FR, '-pointsize', '11', '-annotate', '+604+96', 'ВРАГИ: 8 / 16']
    # score
    cmd += ['-fill', '#ffffff', '-font', F, '-pointsize', '42', '-gravity', 'northeast', '-annotate', '+24+58', '3240']
    cmd += ['-fill', '#8fa697', '-font', F, '-pointsize', '11', '-annotate', '+60+76', 'О Ч К И']
    cmd += ['-fill', '#ffab3d', '-font', F, '-pointsize', '28', '-annotate', '+18+120', '12']
    cmd += ['-fill', '#b7c8ba', '-font', F, '-pointsize', '11', '-annotate', '+72+120', 'К О М Б О']
    # energy + hints
    cmd += ['-gravity', 'northwest']
    cmd += ['-fill', '#1de3c2', '-font', F, '-pointsize', '11', '-annotate', '+22+648', 'Э Н Е Р Г И Я']
    cmd += ['-fill', '#ffffff1f', '-draw', 'roundrectangle 22,666 242,674 4,4']
    cmd += ['-fill', '#1de3c2', '-draw', 'roundrectangle 22,666 210,674 4,4']
    cmd += ['-fill', '#8fa697', '-font', FR, '-pointsize', '10', '-annotate', '+22+690', 'СПЕЦПРИЁМ: ВИХРЬ КАТАНЫ']
    chips = ['WASD движение', 'J удар', 'K тяжёлый', 'L спецприём', 'Пробел прыжок', 'Shift рывок']
    rows = [chips[:5], chips[5:]]
    for ri,row in enumerate(rows):
        x = 1280-22
        yy = 676 - ri*30
        for c in reversed(row):
            w = 12 + len(c)*6.4
            x -= w+6
            cmd += ['-fill', '#061911cc', '-stroke', '#ffffff1a', '-draw', f'roundrectangle {x},{yy} {x+w},{yy+23} 12,12']
            cmd += ['-fill', '#c3d3c6', '-font', FR, '-pointsize', '11', '-annotate', f'+{x+7}+{yy+16}', esc(c)]
    x = 0
    cmd += [dst]
    run(cmd)

# ================= MENU =================
def draw_menu(dst):
    cmd = ['convert', '-size', f'{W}x{H}', 'xc:none',
           '-fill', '#04090bf2', '-draw', f'rectangle 0,0 {W},{H}',
           '-fill', 'none', '-stroke', 'none']
    cmd += ['-fill', '#1de3c2', '-font', F, '-pointsize', '13', '-annotate', '+64+210', 'T E E N A G E   M U T A N T   N I N J A   T U R T L E S']
    cmd += ['-fill', '#f4fff2', '-font', F, '-pointsize', '132', '-annotate', '+58+330', 'ТЕНИ']
    cmd += ['-fill', '#7ee04a', '-font', F, '-pointsize', '132', '-annotate', '+58+452', 'НЬЮ-ЙОРКА']
    cmd += ['-fill', '#9fb4a4', '-font', FR, '-pointsize', '15', '-annotate', '+64+496', '3D-ЭКШЕН  ·  4 ЧЕРЕПАШКИ  ·  ОДИН ШРЕДДЕР']
    # buttons
    bx, by = 64, 548
    cmd += ['-fill', '#7ee04a', '-draw', f'roundrectangle {bx},{by} {bx+322},{by+54} 8,8']
    cmd += ['-fill', '#06120a', '-font', F, '-pointsize', '21', '-annotate', f'+{bx+24}+{by+36}', 'ПРОДОЛЖИТЬ · ГЛАВА 4']
    cmd += ['-fill', '#ffffff12', '-stroke', '#ffffff2e', '-strokewidth', '1', '-draw', f'roundrectangle {bx+334},{by} {bx+520},{by+54} 8,8']
    cmd += ['-fill', '#e9f6ea', '-font', F, '-pointsize', '21', '-annotate', f'+{bx+356}+{by+36}', 'НОВАЯ ИГРА']
    cmd += ['-fill', 'none', '-stroke', '#ffffff2e', '-draw', f'roundrectangle {bx},{by+66} {bx+150},{by+112} 8,8']
    cmd += ['-fill', '#e9f6ea', '-font', F, '-pointsize', '18', '-annotate', f'+{bx+24}+{by+98}', 'ГЛАВЫ']
    cmd += ['-draw', f'roundrectangle {bx+162},{by+66} {bx+362},{by+112} 8,8']
    cmd += ['-fill', '#e9f6ea', '-font', F, '-pointsize', '18', '-annotate', f'+{bx+186}+{by+98}', 'УПРАВЛЕНИЕ']
    cmd += ['-fill', '#8fa697', '-font', FR, '-pointsize', '13', '-annotate', '+64+626', 'Глав открыто: 4 / 4    ·    Рекорд: 12 480    ·    Звук: вкл']
    # cast panel right
    px = 880
    cast = [('Леонардо','Вихрь катаны','#4d8dff'),('Рафаэль','Ярость кулака','#ff5a4d'),
            ('Донателло','Удар посохом','#b76bff'),('Микеланджело','Нунчаку-смерч','#ffab3d')]
    for i,(n,sp,col) in enumerate(cast):
        cx = px + (i%2)*168
        cy = 420 + (i//2)*84
        cmd += ['-fill', '#081014cc', '-stroke', 'none', '-draw', f'roundrectangle {cx},{cy} {cx+160},{cy+74} 10,10']
        cmd += ['-fill', col, '-draw', f'rectangle {cx},{cy} {cx+4},{cy+74}']
        cmd += ['-fill', '#ffffff', '-font', F, '-pointsize', '16', '-annotate', f'+{cx+14}+{cy+26}', esc(n)]
        cmd += ['-fill', '#cfded2', '-font', FR, '-pointsize', '11', '-annotate', f'+{cx+14}+{cy+48}', esc(sp)]
        cmd += ['-fill', '#8fa697', '-font', FR, '-pointsize', '10', '-annotate', f'+{cx+14}+{cy+64}', 'Спецприём черепашки']
    cmd += [dst]
    run(cmd)

# ================= LEVELS =================
def draw_levels(dst):
    cmd = ['-size', '-size', f'{W}x{H}', 'xc:none'] if False else ['convert', '-size', f'{W}x{H}', 'xc:none']
    cmd += ['-fill', '#050a0df0', '-draw', f'rectangle 0,0 {W},{H}']
    cmd += ['-fill', '#0a1317f7', '-stroke', '#7ee04a38', '-strokewidth', '1', '-draw', 'roundrectangle 170,80 1110,640 16,16']
    cmd += ['-font', F, '-pointsize', '34', '-fill', '#f2fff0', '-annotate', '+200+140', 'ГЛАВЫ']
    levels = [('ГЛАВА 1','Переулок Клинка','Первые разведчики Клана Фут прочёсывают переулок.','A'),
              ('ГЛАВА 2','Неоновый рынок','Под неоновыми вывесками Клан Фут торгует не пиццей.','S'),
              ('ГЛАВА 3','Крыши и дождь','Гроза над Манхэттеном. Клан стягивает силы.','B'),
              ('ФИНАЛ','Тень Шреддера','Он ждал вас лично. Стальные когти и клан.','')]
    for i,(k,n,d,r) in enumerate(levels):
        cx = 200 + i*225
        cy = 180
        locked = False
        cmd += ['-fill', '#ffffff0a', '-stroke', '#ffffff1f', '-draw', f'roundrectangle {cx},{cy} {cx+205},{cy+250} 12,12']
        cmd += ['-fill', '#1de3c2', '-font', F, '-pointsize', '12', '-annotate', f'+{cx+14}+{cy+28}', k]
        cmd += ['-fill', '#ffffff', '-font', F, '-pointsize', '22', '-annotate', f'+{cx+14}+{cy+58}', esc(n)]
        for j,line in enumerate(textwrap.wrap(d, 26)):
            cmd += ['-fill', '#96ab9c', '-font', FR, '-pointsize', '11', '-annotate', f'+{cx+14}+{cy+84+j*16}', esc(line)]
        if r:
            cmd += ['-fill', '#ff8a1f', '-font', F, '-pointsize', '14', '-annotate', f'+{cx+14}+{cy+226}', f'ЛУЧШИЙ РАНГ: {r}']
        cmd += ['-fill', '#0d1a14', '-stroke', '#7ee04a', '-strokewidth', '1', '-draw', f'roundrectangle {cx+14},{cy+196} {cx+120},{cy+222} 6,6']
        cmd += ['-fill', '#7ee04a', '-stroke', 'none', '-font', F, '-pointsize', '12', '-annotate', f'+{cx+30}+{cy+214}', 'В БОЙ']
    cmd += [dst]
    run(cmd)



def draw_clear(dst):
    cmd = ['convert', '-size', f'{W}x{H}', 'xc:none',
           '-fill', '#050a0df2', '-draw', f'rectangle 0,0 {W},{H}']
    px, py = 400, 90
    cmd += ['-fill', '#0a1317fa', '-stroke', '#7ee04a38', '-draw', f'roundrectangle {px},{py} {px+480},{py+540} 16,16']
    cmd += ['-fill', '#7ee04a', '-font', F, '-pointsize', '92', '-annotate', f'+{px+200}+{py+120}', 'A']
    cmd += ['-fill', '#f2fff0', '-font', F, '-pointsize', '30', '-annotate', f'+{px+62}+{py+172}', 'ГЛАВА ПРОЙДЕНА']
    rows = [('Очки', '5 434'), ('Время', '1:06'), ('Побеждено', '21'), ('Макс. комбо', '24'),
            ('Урона получено', '148'), ('Без потерь', 'ДА')]
    for i, (k, v) in enumerate(rows):
        y = py + 220 + i * 34
        cmd += ['-fill', '#a9bdb0', '-font', FR, '-pointsize', '13', '-annotate', f'+{px+48}+{y}', k]
        cmd += ['-fill', '#ffffff', '-font', F, '-pointsize', '17', '-annotate', f'+{px+230}+{y}', v]
        cmd += ['-stroke', '#ffffff1a', '-draw', f'line {px+48},{y+8} {px+430},{y+8}']
    cmd += ['-fill', '#1de3c21a', '-stroke', '#1de3c266', '-draw', f'roundrectangle {px+40},{py+432} {px+440},{py+474} 9,9']
    cmd += ['-fill', '#b8f5ea', '-font', FR, '-pointsize', '13', '-annotate', f'+{px+58}+{py+458}', 'Открыта новая глава: Крыши и дождь']
    cmd += ['-fill', '#7ee04a', '-stroke', 'none', '-draw', f'roundrectangle {px+40},{py+490} {px+262},{py+534} 8,8']
    cmd += ['-fill', '#06120a', '-font', F, '-pointsize', '16', '-annotate', f'+{px+56}+{py+519}', 'СЛЕДУЮЩАЯ ГЛАВА']
    cmd += ['-stroke', '#ffffff2e', '-fill', 'none', '-draw', f'roundrectangle {px+274},{py+490} {px+440},{py+534} 8,8']
    cmd += ['-fill', '#e9f6ea', '-font', F, '-pointsize', '16', '-annotate', f'+{px+300}+{py+519}', 'В МЕНЮ']
    cmd += [dst]
    run(cmd)

def draw_boss(dst):
    cmd = ['convert', '-size', f'{W}x{H}', 'xc:none', '-fill', 'none']
    cmd += ['-stroke', '#ff3b30', '-strokewidth', '2', '-draw', f'line 360,250 920,250']
    cmd += ['-fill', '#ffffff', '-font', F, '-pointsize', '96', '-annotate', '+352+340', 'Ш Р Е Д Д Е Р']
    cmd += ['-fill', '#ff8b80', '-font', F, '-pointsize', '14', '-annotate', '+490+366', 'О С Т Р И Ё   К Л А Н А   Ф У Т']
    # boss hp bar top
    cmd += ['-fill', '#ffffff', '-font', F, '-pointsize', '16', '-annotate', '+530+134', 'ШРЕДДЕР']
    cmd += ['-fill', '#ff7b6b', '-font', F, '-pointsize', '12', '-annotate', '+660+134', '— ЯРОСТЬ КЛАНА']
    cmd += ['-fill', '#140000c0', '-stroke', '#ff503c', '-draw', 'roundrectangle 330,144 950,158 7,7']
    cmd += ['-fill', '#ff3b30', '-stroke', 'none', '-draw', 'roundrectangle 332,146 700,156 5,5']
    cmd += [dst]
    run(cmd)

if __name__ == '__main__':
    make_bg('/tmp/bg_clear.png', 'shots/battle.png', blur=7)
    draw_clear('/tmp/clear_layer.png')
    run(['convert', '/tmp/bg_clear.png', '/tmp/clear_layer.png', '-composite', f'{OUT}/ui-clear.png'])
    make_bg('/tmp/bg_boss.png', 'shots/villains.png', blur=5)
    draw_boss('/tmp/boss_layer.png')
    run(['convert', '/tmp/bg_boss.png', '/tmp/boss_layer.png', '-composite', f'{OUT}/ui-boss.png'])
    print('extra ui shots ready')

if __name__ == '__main__':
    base = 'shots/city.png'
    make_bg('/tmp/bg_hud.png', base, blur=0)
    draw_hud('/tmp/hud_layer.png')
    run(['convert', '/tmp/bg_hud.png', '/tmp/hud_layer.png', '-composite', f'{OUT}/ui-hud.png'])
    make_bg('/tmp/bg_menu.png', 'shots/combat.png', blur=8)
    draw_menu('/tmp/menu_layer.png')
    run(['convert', '/tmp/bg_menu.png', '/tmp/menu_layer.png', '-composite', f'{OUT}/ui-menu.png'])
    make_bg('/tmp/bg_lv.png', 'shots/city.png', blur=6)
    draw_levels('/tmp/lv_layer.png')
    run(['convert', '/tmp/bg_lv.png', '/tmp/lv_layer.png', '-composite', f'{OUT}/ui-levels.png'])
    print('ui shots ready')
