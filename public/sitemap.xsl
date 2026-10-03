<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="2.0"
                xmlns:html="http://www.w3.org/TR/REC-html40"
                xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"
                xmlns:sitemap="http://www.sitemaps.org/schemas/sitemap/0.9"
                xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
    <xsl:output method="html" version="1.0" encoding="UTF-8" indent="yes"/>
    <xsl:template match="/">
        <html xmlns="http://www.w3.org/1999/xhtml">
            <head>
                <title>XML Sitemap</title>
                <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
                <style type="text/css">
                    body {
                        font-family: 'Courier New', Courier, monospace;
                        font-size: 14px;
                        color: #f0f0f0;
                        background-color: #000000;
                        line-height: 1.6;
                    }
                    a {
                        color: #f0f0f0;
                        text-decoration: none;
                    }
                    a:hover {
                        text-decoration: underline;
                    }
                    table {
                        border: none;
                        border-collapse: collapse;
                        width: 100%
                    }
                    th {
                        text-align: left;
                        padding-right: 30px;
                        font-size: 12px;
                        color: #ffffff;
                    }
                    thead th {
                        border-bottom: 1px solid #444444;
                        cursor: pointer;
                        padding: 12px 5px;
                    }
                    td {
                        font-size: 12px;
                        padding: 8px 5px;
                    }
                    tr:nth-child(odd) td {
                        background-color: rgba(255,255,255,0.03);
                    }
                    tr:hover td {
                        background-color: rgba(255,255,255,0.08);
                    }

                    #content {
                        margin: 0;
                        padding: 40px 20px;
                        max-width: 720px;
                    }

                    .desc {
                        margin: 24px 0;
                        line-height: 1.8em;
                    }
                    .desc a {
                        color: #f0f0f0;
                    }

                    h1 {
                        color: #ffffff;
                        font-weight: normal;
                        letter-spacing: 0.5px;
                    }
                </style>
            </head>
            <body>
                <div id="content">
                    <xsl:choose>
                        <xsl:when test="count(sitemap:sitemapindex/sitemap:sitemap) &gt; 0">
                            <h1>XML Sitemap Index</h1>
                            <p class="desc">
                                This sitemap index contains links to all sitemaps for this site.
                            </p>
                        </xsl:when>
                        <xsl:otherwise>
                            <h1>XML Sitemap</h1>
                            <p class="desc">
                                This sitemap allows search engines to discover and index the site's content.
                            </p>
                        </xsl:otherwise>
                    </xsl:choose>
                    <xsl:if test="count(sitemap:sitemapindex/sitemap:sitemap) &gt; 0">
                        <table id="sitemap" cellpadding="3">
                            <thead>
                                <tr>
                                    <th width="75%">Sitemap</th>
                                    <th width="25%">Last Modified</th>
                                </tr>
                            </thead>
                            <tbody>
                            <xsl:for-each select="sitemap:sitemapindex/sitemap:sitemap">
                                <xsl:variable name="sitemapURL">
                                    <xsl:value-of select="sitemap:loc"/>
                                </xsl:variable>
                                <tr>
                                    <td>
                                        <a href="{$sitemapURL}"><xsl:value-of select="sitemap:loc"/></a>
                                    </td>
                                    <td>
                                        <xsl:value-of select="concat(substring(sitemap:lastmod,0,11),concat(' ', substring(sitemap:lastmod,12,5)))"/>
                                    </td>
                                </tr>
                            </xsl:for-each>
                            </tbody>
                        </table>
                    </xsl:if>
                    <xsl:if test="count(sitemap:sitemapindex/sitemap:sitemap) &lt; 1">
                        <p class="desc"><a href="/sitemap.xml" class="back-link">&#8592; Back to index</a></p>
                        <table id="sitemap" cellpadding="3">
                            <thead>
                                <tr>
                                    <th width="55%">URL (<xsl:value-of select="count(sitemap:urlset/sitemap:url)"/> total)</th>
                                    <th width="5%">Images</th>
                                    <th width="10%">Change Frequency</th>
                                    <th width="10%">Priority</th>
                                    <th title="Last Modification Time" width="20%">Last Modified</th>
                                </tr>
                            </thead>
                            <tbody>
                                <xsl:variable name="lower" select="'abcdefghijklmnopqrstuvwxyz'"/>
                                <xsl:variable name="upper" select="'ABCDEFGHIJKLMNOPQRSTUVWXYZ'"/>
                                <xsl:for-each select="sitemap:urlset/sitemap:url">
                                    <tr>
                                        <td>
                                            <xsl:variable name="itemURL">
                                                <xsl:value-of select="sitemap:loc"/>
                                            </xsl:variable>
                                            <a href="{$itemURL}">
                                                <xsl:value-of select="sitemap:loc"/>
                                            </a>
                                        </td>
                                        <td>
                                            <xsl:value-of select="count(image:image)"/>
                                        </td>
                                        <td>
                                            <xsl:value-of select="sitemap:changefreq"/>
                                        </td>
                                        <td>
                                            <xsl:value-of select="sitemap:priority"/>
                                        </td>
                                        <td>
                                            <xsl:value-of select="concat(substring(sitemap:lastmod,0,11),concat(' ', substring(sitemap:lastmod,12,5)))"/>
                                        </td>
                                    </tr>
                                </xsl:for-each>
                            </tbody>
                        </table>
                        <p class="desc"><a href="/sitemap.xml" class="back-link">&#8592; Back to index</a></p>
                    </xsl:if>
                </div>
            </body>
        </html>

    </xsl:template>
</xsl:stylesheet>