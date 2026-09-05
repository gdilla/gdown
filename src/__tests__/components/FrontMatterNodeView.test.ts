import { afterEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { Editor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import { defineComponent, h, nextTick } from 'vue'
import { FrontMatter } from '../../extensions/FrontMatter'
import { htmlToMarkdown, markdownToHtml } from '../../utils/markdownConverter'
import { assembleFrontMatter, parseFrontMatter } from '../../utils/frontmatter'

describe('FrontMatterNodeView', () => {
  let editor: Editor | undefined
  let wrapper: VueWrapper | undefined

  afterEach(() => {
    wrapper?.unmount()
    editor?.destroy()
    wrapper = undefined
    editor = undefined
  })

  async function mountFrontMatter(rawYaml: string): Promise<VueWrapper> {
    const Harness = defineComponent({
      setup() {
        const instance = new Editor({
          extensions: [StarterKit, FrontMatter],
          content: markdownToHtml(assembleFrontMatter(rawYaml, 'Body')),
        })
        editor = instance
        return () => h(EditorContent, { editor: instance })
      },
    })

    wrapper = mount(Harness)
    await nextTick()
    await nextTick()
    return wrapper
  }

  const complexYamlFixtures: Array<[string, string]> = [
    ['block scalar', 'description: |\n  First line\n  Second line'],
    ['nested mapping', 'author:\n  name: Ada'],
    ['comments', '# managed metadata\ntitle: Draft'],
  ]

  it.each(complexYamlFixtures)(
    'keeps %s YAML in the raw editor and preserves source output',
    async (_name, rawYaml) => {
      const mounted = await mountFrontMatter(rawYaml)

      const block = mounted.find('.frontmatter-block')
      expect(block.exists()).toBe(true)
      expect(block.classes()).toContain('is-editing-raw')
      expect(block.find('.frontmatter-fields').exists()).toBe(false)
      expect(block.find('.frontmatter-btn-add').exists()).toBe(false)
      expect(block.find('.frontmatter-raw-hint').text()).toContain('structure is preserved')
      expect((block.find('textarea').element as HTMLTextAreaElement).value).toBe(rawYaml)

      await block.find('textarea').setValue(rawYaml)
      await block.find('textarea').trigger('blur')
      await nextTick()

      const source = htmlToMarkdown(editor!.getHTML())
      expect(source).toContain(assembleFrontMatter(rawYaml, ''))

      const parsed = parseFrontMatter(source)
      expect(parsed.hasFrontMatter).toBe(true)
      expect(parsed.rawYaml).toBe(rawYaml)
      expect(parsed.body.trim()).toBe('Body')
    },
  )

  it('keeps simple metadata available in the fields editor', async () => {
    const mounted = await mountFrontMatter('title: Draft\ncount: 2')

    const block = mounted.find('.frontmatter-block')
    expect(block.classes()).not.toContain('is-editing-raw')
    expect(block.find('.frontmatter-fields').exists()).toBe(true)
    expect(block.findAll('.frontmatter-key')).toHaveLength(2)
    expect(block.find('.frontmatter-btn-add').exists()).toBe(true)
    expect(block.find('textarea').exists()).toBe(false)
  })

  it('locks the raw editor after simple YAML becomes complex', async () => {
    const mounted = await mountFrontMatter('title: Draft')
    const block = mounted.find('.frontmatter-block')
    const rawYaml = 'description: |\n  First line\n  Second line'

    await block.find('.frontmatter-btn').trigger('click')
    await nextTick()
    await block.find('textarea').setValue(rawYaml)
    await block.find('textarea').trigger('blur')
    await nextTick()
    await nextTick()

    expect(block.find('.frontmatter-raw-hint').exists()).toBe(true)
    expect(block.find('.frontmatter-btn').exists()).toBe(false)
    expect(block.find('.frontmatter-btn-add').exists()).toBe(false)
    expect(parseFrontMatter(htmlToMarkdown(editor!.getHTML())).rawYaml).toBe(rawYaml)
  })
})
